/**
 * ============================================
 * ASTRYX ECONOMY DISCORD BOT - STANDALONE
 * ============================================
 * A complete economy bot system with shop, inventory, and commands
 * All code consolidated into a single file for easy deployment
 *
 * Features:
 * - 10 slash commands: daily, work, balance, pay, rob, shop, inventory, leaderboard, profile, help
 * - Shop with 5 categories (tools, weapons, collectibles, consumables, upgrades)
 * - Inventory management with item usage and selling
 * - Anti-cheat logging system tracking all transactions
 * - Cooldown management (daily: 24h, work: 4h, rob: 12h)
 * - Leveling system with XP tracking
 * - Leaderboard with coin and XP sorting
 * - Interactive buttons and select menus for better UX
 *
 * Database: Supabase PostgreSQL with 6 tables
 * - profiles: user data, coins, XP, streaks
 * - items: shop items with effects and rarities
 * - inventory: user owned items
 * - transactions: anti-cheat logging
 * - cooldowns: command rate limiting
 * - server_settings: customizable economy rates
 *
 * Setup Instructions:
 * 1. Install dependencies: npm install discord.js @supabase/supabase-js dotenv
 * 2. Create .env file with:
 *    - DISCORD_TOKEN=your_bot_token
 *    - DISCORD_CLIENT_ID=your_application_id
 *    - SUPABASE_URL=your_supabase_url
 *    - SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
 * 3. Run: node bot.js
 */

import {
  Client, // Discord client for bot connection
  GatewayIntentBits, // Intents for receiving events
  Collection, // Data structure for storing commands
  REST, // REST API client for registering commands
  Routes, // Discord API routes for command registration
  SlashCommandBuilder, // Builder for slash commands
  EmbedBuilder, // Builder for rich embeds
  ActionRowBuilder, // Builder for button/menu rows
  StringSelectMenuBuilder, // Builder for dropdown select menus
  ButtonBuilder, // Builder for interactive buttons
  ButtonStyle, // Styles for button appearance
} from "discord.js"
import { createClient } from "@supabase/supabase-js" // Supabase database client
import { config } from "dotenv" // Environment variable loader

config()

// ============================================
// SUPABASE DATABASE CLIENT & INITIALIZATION
// ============================================
// Service role bypasses RLS policies, allowing the bot full database access
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

/**
 * Get or create user profile in database
 * @param {string} userId - Discord user ID (snowflake)
 * @param {string} username - Discord username
 * @returns {Promise<Object>} User profile object with coins, XP, level, etc.
 *
 * Database profile retrieval with auto-creation on first use
 * If user doesn't exist, creates profile with 1000 starting coins
 * Handles PGRST116 error code (no rows returned) by creating new profile
 */
async function getProfile(userId, username) {
  // Query database for existing profile
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single()

  // If user doesn't exist, create new profile
  if (error && error.code === "PGRST116") {
    const { data: newProfile, error: createError } = await supabase
      .from("profiles")
      .insert({
        id: userId, // Discord user ID as text (not UUID)
        username: username, // Discord username
        coins: 1000, // Starting balance
        xp: 0, // Starting XP
        level: 1, // Starting level
      })
      .select()
      .single()

    if (createError) throw createError
    return newProfile
  }

  if (error) throw error
  return data
}

/**
 * Update user profile with new values
 * @param {string} userId - Discord user ID
 * @param {Object} updates - Object with fields to update (coins, xp, level, etc.)
 * @returns {Promise<Object>} Updated profile object
 *
 * Profile updates with automatic timestamp
 * Always updates the updated_at field to track when profile was last modified
 */
async function updateProfile(userId, updates) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ ...updates, updated_at: new Date().toISOString() }) // Add update timestamp
    .eq("id", userId)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Log transaction for anti-cheat monitoring
 * @param {Object} transaction - Transaction object with userId, type, amount, etc.
 *
 * Anti-cheat logging system
 * Records all economy transactions for audit trail and fraud detection
 * Transaction types: daily, work, pay, rob, shop_buy, shop_sell, use_item, admin
 */
async function logTransaction(transaction) {
  const { error } = await supabase.from("transactions").insert({
    user_id: transaction.userId, // Discord user ID
    type: transaction.type, // Command that generated transaction
    amount: transaction.amount || null, // Coins affected (positive or negative)
    target_user_id: transaction.targetUserId || null, // For pay/rob commands
    item_id: transaction.itemId || null, // For shop commands
    metadata: transaction.metadata || null, // Additional data (streak, boost amount, etc.)
    created_at: new Date().toISOString(), // Timestamp
  })

  if (error) console.error("Failed to log transaction:", error)
}

/**
 * Check if user is on command cooldown
 * @param {string} userId - Discord user ID
 * @param {string} command - Command name (daily, work, rob)
 * @returns {Promise<Object>} {onCooldown: boolean, expiresAt: Date|null}
 *
 * Cooldown checking with auto-cleanup
 * Returns cooldown status and expiration time
 * Automatically deletes expired cooldowns from database
 */
async function checkCooldown(userId, command) {
  // Query cooldown table for this user/command combination
  const { data } = await supabase
    .from("cooldowns")
    .select("expires_at")
    .eq("user_id", userId)
    .eq("command", command)
    .single()

  // No cooldown exists
  if (!data) return { onCooldown: false, expiresAt: null }

  const expiresAt = new Date(data.expires_at)
  const now = new Date()

  // Cooldown is still active
  if (expiresAt > now) {
    return { onCooldown: true, expiresAt }
  }

  // Cooldown expired, delete it
  await supabase.from("cooldowns").delete().eq("user_id", userId).eq("command", command)
  return { onCooldown: false, expiresAt: null }
}

/**
 * Set command cooldown for user
 * @param {string} userId - Discord user ID
 * @param {string} command - Command name
 * @param {number} hours - Cooldown duration in hours
 *
 * Cooldown creation with upsert
 * Uses upsert to update existing cooldown or create new one
 * Prevents multiple cooldowns for same command
 */
async function setCooldown(userId, command, hours) {
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + hours)

  // Upsert: update if exists, insert if doesn't
  await supabase.from("cooldowns").upsert({
    user_id: userId,
    command,
    expires_at: expiresAt.toISOString(),
  })
}

/**
 * Get server economy settings
 * @returns {Promise<Object>} Settings object with all rates and multipliers
 *
 * Server settings retrieval
 * Single row table with customizable economy parameters
 * Values can be updated via admin commands
 */
async function getServerSettings() {
  const { data, error } = await supabase.from("server_settings").select("*").single()
  if (error) throw error
  return data
}

/**
 * Get shop items, optionally filtered by category
 * @param {string} category - Category filter (tools, weapons, collectibles, consumables, upgrades)
 * @returns {Promise<Array>} Array of item objects
 *
 * Item retrieval with optional category filtering
 * Items sorted by price ascending for display
 * Each item has name, price, category, rarity, and effect
 */
async function getItems(category = null) {
  let query = supabase.from("items").select("*").order("price", { ascending: true })
  if (category) query = query.eq("category", category)
  const { data, error } = await query
  if (error) throw error
  return data
}

/**
 * Get user inventory with item details
 * @param {string} userId - Discord user ID
 * @returns {Promise<Array>} Array of inventory items with joined item data
 *
 * Inventory retrieval with item data
 * Uses join to include full item information (price, effect, rarity, etc.)
 * Returns items array sorted by acquisition time
 */
async function getInventory(userId) {
  const { data, error } = await supabase.from("inventory").select(`*, items (*)`).eq("user_id", userId)
  if (error) throw error
  return data
}

/**
 * Add item to user inventory or increase quantity
 * @param {string} userId - Discord user ID
 * @param {string} itemId - Item UUID
 * @param {number} quantity - Quantity to add (default 1)
 *
 * Inventory addition with quantity stacking
 * Checks for existing item and increments quantity
 * If item doesn't exist, creates new inventory entry
 */
async function addToInventory(userId, itemId, quantity = 1) {
  // Check if item already in inventory
  const { data: existing } = await supabase
    .from("inventory")
    .select("*")
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .single()

  if (existing) {
    // Item exists, increase quantity
    await supabase
      .from("inventory")
      .update({ quantity: existing.quantity + quantity })
      .eq("user_id", userId)
      .eq("item_id", itemId)
  } else {
    // New item, create entry
    await supabase.from("inventory").insert({
      user_id: userId,
      item_id: itemId,
      quantity,
    })
  }
}

/**
 * Remove item from user inventory or decrease quantity
 * @param {string} userId - Discord user ID
 * @param {string} itemId - Item UUID
 * @param {number} quantity - Quantity to remove (default 1)
 *
 * Inventory removal with quantity handling
 * Deletes entry if quantity reaches 0
 * Throws error if item not in inventory
 */
async function removeFromInventory(userId, itemId, quantity = 1) {
  const { data: existing } = await supabase
    .from("inventory")
    .select("*")
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .single()

  if (!existing) throw new Error("Item not found in inventory")

  if (existing.quantity <= quantity) {
    // Remove entire entry if quantity equals or less than removal amount
    await supabase.from("inventory").delete().eq("user_id", userId).eq("item_id", itemId)
  } else {
    // Decrease quantity
    await supabase
      .from("inventory")
      .update({ quantity: existing.quantity - quantity })
      .eq("user_id", userId)
      .eq("item_id", itemId)
  }
}

/**
 * Get leaderboard for coins or XP
 * @param {string} type - "coins" or "xp"
 * @param {number} limit - Number of entries to return (default 10)
 * @returns {Promise<Array>} Array of top players
 *
 * Leaderboard with dynamic sorting
 * Sorts by requested type in descending order
 * Returns top profiles with username, coins, XP, and level
 */
async function getLeaderboard(type = "coins", limit = 10) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, coins, xp, level")
    .order(type, { ascending: false }) // Sort descending (highest first)
    .limit(limit)
  if (error) throw error
  return data
}

// ============================================
// VISUAL CONSTANTS FOR EMBEDS & MESSAGES
// ============================================
// Colors used in embed fields to visually represent item rarity tiers
const RARITY_COLORS = {
  common: "#95A5A6", // Gray
  uncommon: "#2ECC71", // Green
  rare: "#3498DB", // Blue
  epic: "#9B59B6", // Purple
  legendary: "#F39C12", // Orange
}

// Emojis displayed next to item names for quick visual identification
const RARITY_EMOJIS = {
  common: "⚪",
  uncommon: "🟢",
  rare: "🔵",
  epic: "🟣",
  legendary: "🟠",
}

// ============================================
// COMMAND: /daily
// ============================================
// Users earn base coins plus streak bonuses for consecutive daily claims
// Resets streak after 48 hours without claiming
const dailyCommand = {
  data: new SlashCommandBuilder().setName("daily").setDescription("Claim your daily reward with streak bonuses"),

  async execute(interaction) {
    await interaction.deferReply()
    try {
      const userId = interaction.user.id
      const username = interaction.user.username

      // Check if user can use command (cooldown)
      const cooldown = await checkCooldown(userId, "daily")
      if (cooldown.onCooldown) {
        const timeLeft = Math.ceil((cooldown.expiresAt - new Date()) / 1000 / 60 / 60)
        return interaction.editReply(`⏰ You can claim your daily reward in **${timeLeft}** hours.`)
      }

      // Get user profile and server settings
      const [profile, settings] = await Promise.all([getProfile(userId, username), getServerSettings()])

      // Calculate streak: if last daily was 24-48 hours ago, increment streak
      const now = new Date()
      const lastDaily = profile.last_daily ? new Date(profile.last_daily) : null
      let newStreak = 0

      if (lastDaily) {
        const hoursSinceDaily = (now - lastDaily) / 1000 / 60 / 60
        if (hoursSinceDaily >= 24 && hoursSinceDaily <= 48) {
          newStreak = profile.daily_streak + 1 // Extend streak
        }
        // If >48 hours, streak resets to 0 (new streak)
      }

      // Calculate reward: base + streak bonus
      const baseAmount = settings.daily_amount
      const streakBonus = Math.min(newStreak * 50, 500) // Max 500 coins bonus
      const totalAmount = baseAmount + streakBonus
      const xpGain = 10
      const newXP = profile.xp + xpGain
      const newLevel = Math.floor(newXP / 1000) + 1

      // Update profile in database
      await updateProfile(userId, {
        coins: profile.coins + totalAmount,
        xp: newXP,
        level: newLevel,
        daily_streak: newStreak,
        last_daily: now.toISOString(),
      })

      // Set 24-hour cooldown
      await setCooldown(userId, "daily", settings.daily_cooldown_hours)

      // Log transaction for anti-cheat
      await logTransaction({
        userId,
        type: "daily",
        amount: totalAmount,
        metadata: { streak: newStreak, xp_gain: xpGain },
      })

      // Send embed response
      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("💰 Daily Reward Claimed!")
        .setDescription(`You received **${totalAmount} coins** and **${xpGain} XP**!`)
        .addFields(
          { name: "💵 Base Reward", value: `${baseAmount} coins`, inline: true },
          { name: "🔥 Streak Bonus", value: `${streakBonus} coins (${newStreak} days)`, inline: true },
          { name: "📊 Level", value: `Level ${newLevel}`, inline: true },
        )
        .setFooter({ text: "Come back in 24 hours for your next reward!" })
        .setTimestamp()

      await interaction.editReply({ embeds: [embed] })
    } catch (error) {
      console.error("Error in /daily:", error)
      await interaction.editReply("❌ An error occurred while processing your daily reward.")
    }
  },
}

// ============================================
// COMMAND: /work
// ============================================
// Earns random coins boosted by tools in inventory
// Cooldown reduced by tool effects
const workCommand = {
  data: new SlashCommandBuilder()
    .setName("work")
    .setDescription("Work to earn coins (affected by tools in your inventory)"),

  async execute(interaction) {
    await interaction.deferReply()
    try {
      const userId = interaction.user.id
      const username = interaction.user.username

      // Check cooldown
      const cooldown = await checkCooldown(userId, "work")
      if (cooldown.onCooldown) {
        const timeLeft = Math.ceil((cooldown.expiresAt - new Date()) / 1000 / 60)
        return interaction.editReply(`⏰ You can work again in **${timeLeft}** minutes.`)
      }

      // Get profile, settings, and inventory
      const [profile, settings, inventory] = await Promise.all([
        getProfile(userId, username),
        getServerSettings(),
        getInventory(userId),
      ])

      // Generate random work reward between min and max
      const baseAmount = Math.floor(
        Math.random() * (settings.work_max_amount - settings.work_min_amount + 1) + settings.work_min_amount,
      )

      // Check inventory for work boost tools
      // Takes the highest boost available
      let totalBoost = 0
      let bestTool = null
      for (const invItem of inventory) {
        const effect = invItem.items.effect
        if (effect && effect.type === "work_boost") {
          if (effect.value > totalBoost) {
            totalBoost = effect.value
            bestTool = invItem.items.name
          }
        }
      }

      // Calculate boosted earnings
      const boostAmount = Math.floor(baseAmount * totalBoost)
      const totalAmount = baseAmount + boostAmount
      const xpGain = Math.floor(totalAmount / 10)
      const newXP = profile.xp + xpGain
      const newLevel = Math.floor(newXP / 1000) + 1

      // Update profile
      await updateProfile(userId, {
        coins: profile.coins + totalAmount,
        xp: newXP,
        level: newLevel,
        last_work: new Date().toISOString(),
      })

      // Check for cooldown reductions from tools
      let cooldownHours = settings.work_cooldown_hours
      for (const invItem of inventory) {
        const effect = invItem.items.effect
        if (effect && effect.type === "cooldown_reduction" && effect.command === "work") {
          cooldownHours = Math.max(1, cooldownHours - effect.value)
        }
      }

      // Set cooldown
      await setCooldown(userId, "work", cooldownHours)

      // Log transaction
      await logTransaction({
        userId,
        type: "work",
        amount: totalAmount,
        metadata: { base: baseAmount, boost: boostAmount, tool: bestTool, xp_gain: xpGain },
      })

      const embed = new EmbedBuilder()
        .setColor("#3498db")
        .setTitle("💼 Work Complete!")
        .setDescription(`You earned **${totalAmount} coins** and **${xpGain} XP**!`)
        .addFields(
          { name: "💵 Base Earnings", value: `${baseAmount} coins`, inline: true },
          { name: "⚡ Boost", value: bestTool ? `+${boostAmount} coins (${bestTool})` : "None", inline: true },
          { name: "📊 Level", value: `Level ${newLevel}`, inline: true },
        )
        .setFooter({ text: `Cooldown: ${cooldownHours} hours` })
        .setTimestamp()

      await interaction.editReply({ embeds: [embed] })
    } catch (error) {
      console.error("Error in /work:", error)
      await interaction.editReply("❌ An error occurred while processing your work.")
    }
  },
}

// ============================================
// COMMAND: /balance
// ============================================
// Shows coins, level, XP progress, daily streak, and robbery attempts
const balanceCommand = {
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your balance and stats")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to check (leave empty for yourself)").setRequired(false),
    ),

  async execute(interaction) {
    await interaction.deferReply()
    try {
      const targetUser = interaction.options.getUser("user") || interaction.user
      const profile = await getProfile(targetUser.id, targetUser.username)

      // Calculate XP progress to next level
      const currentLevelXP = (profile.level - 1) * 1000
      const nextLevelXP = profile.level * 1000
      const progressXP = profile.xp - currentLevelXP
      const requiredXP = nextLevelXP - currentLevelXP
      const progressPercent = Math.floor((progressXP / requiredXP) * 100)

      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle(`${targetUser.username}'s Balance`)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
          { name: "💰 Coins", value: `${profile.coins.toLocaleString()}`, inline: true },
          { name: "📊 Level", value: `${profile.level}`, inline: true },
          { name: "⭐ XP", value: `${profile.xp.toLocaleString()}`, inline: true },
          { name: "🔥 Daily Streak", value: `${profile.daily_streak} days`, inline: true },
          { name: "📈 Progress", value: `${progressXP}/${requiredXP} XP (${progressPercent}%)`, inline: true },
          { name: "🎯 Rob Attempts", value: `${profile.rob_attempts}`, inline: true },
        )
        .setTimestamp()

      await interaction.editReply({ embeds: [embed] })
    } catch (error) {
      console.error("Error in /balance:", error)
      await interaction.editReply("❌ An error occurred while fetching balance.")
    }
  },
}

// ============================================
// COMMAND: /pay
// ============================================
// Allows users to send coins to other players with validation
const payCommand = {
  data: new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Transfer coins to another user")
    .addUserOption((option) => option.setName("user").setDescription("User to pay").setRequired(true))
    .addIntegerOption((option) =>
      option.setName("amount").setDescription("Amount of coins to transfer").setRequired(true).setMinValue(1),
    ),

  async execute(interaction) {
    await interaction.deferReply()
    try {
      const sender = interaction.user
      const recipient = interaction.options.getUser("user")
      const amount = interaction.options.getInteger("amount")

      // Validation checks
      if (sender.id === recipient.id) {
        return interaction.editReply("❌ You cannot pay yourself!")
      }

      if (recipient.bot) {
        return interaction.editReply("❌ You cannot pay bots!")
      }

      // Get both profiles
      const [senderProfile, recipientProfile] = await Promise.all([
        getProfile(sender.id, sender.username),
        getProfile(recipient.id, recipient.username),
      ])

      // Check sender has enough coins
      if (senderProfile.coins < amount) {
        return interaction.editReply(`❌ You don't have enough coins! You have **${senderProfile.coins}** coins.`)
      }

      // Update both profiles
      await Promise.all([
        updateProfile(sender.id, { coins: senderProfile.coins - amount }),
        updateProfile(recipient.id, { coins: recipientProfile.coins + amount }),
      ])

      // Log transactions for both sides
      await Promise.all([
        logTransaction({
          userId: sender.id,
          type: "pay",
          amount: -amount,
          targetUserId: recipient.id,
        }),
        logTransaction({
          userId: recipient.id,
          type: "pay",
          amount: amount,
          targetUserId: sender.id,
        }),
      ])

      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("💸 Payment Successful!")
        .setDescription(`**${sender.username}** paid **${recipient.username}** ${amount} coins`)
        .addFields(
          { name: "Sender Balance", value: `${(senderProfile.coins - amount).toLocaleString()} coins`, inline: true },
          {
            name: "Recipient Balance",
            value: `${(recipientProfile.coins + amount).toLocaleString()} coins`,
            inline: true,
          },
        )
        .setTimestamp()

      await interaction.editReply({ embeds: [embed] })
    } catch (error) {
      console.error("Error in /pay:", error)
      await interaction.editReply("❌ An error occurred while processing the payment.")
    }
  },
}

// ============================================
// COMMAND: /rob
// ============================================
// Risky command to steal coins from other players
// Higher defense reduces success rate, failure incurs penalty
const robCommand = {
  data: new SlashCommandBuilder()
    .setName("rob")
    .setDescription("Attempt to rob another user (risky!)")
    .addUserOption((option) => option.setName("user").setDescription("User to rob").setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply()
    try {
      const robber = interaction.user
      const target = interaction.options.getUser("user")

      // Validation
      if (robber.id === target.id) {
        return interaction.editReply("❌ You cannot rob yourself!")
      }

      if (target.bot) {
        return interaction.editReply("❌ You cannot rob bots!")
      }

      // Check cooldown
      const cooldown = await checkCooldown(robber.id, "rob")
      if (cooldown.onCooldown) {
        const timeLeft = Math.ceil((cooldown.expiresAt - new Date()) / 1000 / 60 / 60)
        return interaction.editReply(`⏰ You can rob again in **${timeLeft}** hours.`)
      }

      // Get all necessary data
      const [robberProfile, targetProfile, settings, robberInventory, targetInventory] = await Promise.all([
        getProfile(robber.id, robber.username),
        getProfile(target.id, target.username),
        getServerSettings(),
        getInventory(robber.id),
        getInventory(target.id),
      ])

      // Validation: target must have coins and robber must risk coins
      if (targetProfile.coins < 500) {
        return interaction.editReply(`❌ **${target.username}** doesn't have enough coins to rob (minimum 500).`)
      }

      if (robberProfile.coins < 100) {
        return interaction.editReply("❌ You need at least **100 coins** to attempt a robbery.")
      }

      // Calculate target's defense from inventory items
      let targetDefense = 0
      for (const invItem of targetInventory) {
        const effect = invItem.items.effect
        if (effect && effect.type === "rob_defense") {
          targetDefense = Math.max(targetDefense, effect.value)
        }
      }

      // Calculate success rate: base rate - defense
      const baseSuccessRate = Number.parseFloat(settings.rob_success_rate)
      const actualSuccessRate = Math.max(0.1, baseSuccessRate - targetDefense)
      const success = Math.random() < actualSuccessRate

      // If successful, steal 10-20% of target's coins
      const percentage = Math.random() * 0.2 + 0.1
      const robAmount = Math.floor(targetProfile.coins * percentage)

      if (success) {
        // SUCCESS: Transfer coins
        await Promise.all([
          updateProfile(robber.id, {
            coins: robberProfile.coins + robAmount,
            rob_attempts: robberProfile.rob_attempts + 1,
          }),
          updateProfile(target.id, {
            coins: targetProfile.coins - robAmount,
          }),
        ])

        await logTransaction({
          userId: robber.id,
          type: "rob",
          amount: robAmount,
          targetUserId: target.id,
          metadata: { success: true, defense: targetDefense },
        })

        const embed = new EmbedBuilder()
          .setColor("#00FF00")
          .setTitle("💰 Robbery Successful!")
          .setDescription(`You successfully robbed **${target.username}** and stole **${robAmount} coins**!`)
          .addFields(
            {
              name: "Your Balance",
              value: `${(robberProfile.coins + robAmount).toLocaleString()} coins`,
              inline: true,
            },
            {
              name: "Target Balance",
              value: `${(targetProfile.coins - robAmount).toLocaleString()} coins`,
              inline: true,
            },
          )
          .setFooter({ text: "Better luck next time for them!" })
          .setTimestamp()

        await interaction.editReply({ embeds: [embed] })
      } else {
        // FAILURE: Pay penalty
        const penaltyAmount = Math.floor(robberProfile.coins * Number.parseFloat(settings.rob_penalty_percent))

        await updateProfile(robber.id, {
          coins: robberProfile.coins - penaltyAmount,
          rob_attempts: robberProfile.rob_attempts + 1,
        })

        await logTransaction({
          userId: robber.id,
          type: "rob",
          amount: -penaltyAmount,
          targetUserId: target.id,
          metadata: { success: false, defense: targetDefense },
        })

        const embed = new EmbedBuilder()
          .setColor("#FF0000")
          .setTitle("❌ Robbery Failed!")
          .setDescription(
            `You were caught trying to rob **${target.username}** and lost **${penaltyAmount} coins** as a fine!`,
          )
          .addFields(
            {
              name: "Your Balance",
              value: `${(robberProfile.coins - penaltyAmount).toLocaleString()} coins`,
              inline: true,
            },
            { name: "Defense", value: `${Math.floor(targetDefense * 100)}%`, inline: true },
          )
          .setFooter({ text: "Be more careful next time!" })
          .setTimestamp()

        await interaction.editReply({ embeds: [embed] })
      }

      // Set 12-hour cooldown
      await setCooldown(robber.id, "rob", settings.rob_cooldown_hours)
    } catch (error) {
      console.error("Error in /rob:", error)
      await interaction.editReply("❌ An error occurred while processing the robbery.")
    }
  },
}

// ============================================
// COMMAND: /shop
// ============================================
// Browse items by category, select menu interface
const shopCommand = {
  data: new SlashCommandBuilder().setName("shop").setDescription("Browse the shop and buy items"),

  async execute(interaction) {
    await interaction.deferReply()
    try {
      const items = await getItems()

      // Group items by category
      const categories = {
        tools: items.filter((i) => i.category === "tools"),
        weapons: items.filter((i) => i.category === "weapons"),
        collectibles: items.filter((i) => i.category === "collectibles"),
        consumables: items.filter((i) => i.category === "consumables"),
        upgrades: items.filter((i) => i.category === "upgrades"),
      }

      // Create category select menu
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("shop_category")
        .setPlaceholder("Select a category")
        .addOptions([
          { label: "🔧 Tools", description: "Items that boost work rewards", value: "tools" },
          { label: "⚔️ Weapons", description: "Protection against robberies", value: "weapons" },
          { label: "🎨 Collectibles", description: "Rare items for collection", value: "collectibles" },
          { label: "🧪 Consumables", description: "Single-use items with special effects", value: "consumables" },
          { label: "⭐ Upgrades", description: "Permanent passive bonuses", value: "upgrades" },
        ])

      const row = new ActionRowBuilder().addComponents(selectMenu)

      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle("🏪 Astryx Economy Shop")
        .setDescription("Browse items by category. Select a category below to view available items!")
        .addFields(
          { name: "🔧 Tools", value: `${categories.tools.length} items`, inline: true },
          { name: "⚔️ Weapons", value: `${categories.weapons.length} items`, inline: true },
          { name: "🎨 Collectibles", value: `${categories.collectibles.length} items`, inline: true },
          { name: "🧪 Consumables", value: `${categories.consumables.length} items`, inline: true },
          { name: "⭐ Upgrades", value: `${categories.upgrades.length} items`, inline: true },
          { name: "\u200B", value: "\u200B", inline: true },
        )
        .setFooter({ text: "Use /balance to check your coins" })

      await interaction.editReply({ embeds: [embed], components: [row] })
    } catch (error) {
      console.error("Error in /shop:", error)
      await interaction.editReply("❌ An error occurred while loading the shop.")
    }
  },

  /**
   * Handle category selection from dropdown menu
   * Displays items in selected category with buy buttons
   */
  async handleSelect(interaction) {
    await interaction.deferUpdate()
    try {
      const category = interaction.values[0]
      const items = await getItems(category)

      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle(`🏪 ${category.charAt(0).toUpperCase() + category.slice(1)} Shop`)
        .setFooter({ text: "Click a button below to purchase an item" })

      // Display first 10 items in category
      for (const item of items.slice(0, 10)) {
        const rarityEmoji = RARITY_EMOJIS[item.rarity]
        const effectText = item.effect ? formatEffect(item.effect) : "No special effect"

        embed.addFields({
          name: `${rarityEmoji} ${item.name} - ${item.price.toLocaleString()} coins`,
          value: `${item.description}\n*Effect: ${effectText}*`,
          inline: false,
        })
      }

      // Create buy buttons for first 5 items
      const buttons = items
        .slice(0, 5)
        .map((item) =>
          new ButtonBuilder()
            .setCustomId(`shop_buy_${item.id}`)
            .setLabel(`Buy ${item.name}`)
            .setStyle(ButtonStyle.Success),
        )

      // Organize buttons into rows (max 5 per row)
      const buttonRows = []
      for (let i = 0; i < buttons.length; i += 5) {
        buttonRows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)))
      }

      // Add category menu at bottom
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("shop_category")
        .setPlaceholder("Change category")
        .addOptions([
          { label: "🔧 Tools", value: "tools" },
          { label: "⚔️ Weapons", value: "weapons" },
          { label: "🎨 Collectibles", value: "collectibles" },
          { label: "🧪 Consumables", value: "consumables" },
          { label: "⭐ Upgrades", value: "upgrades" },
        ])

      buttonRows.push(new ActionRowBuilder().addComponents(selectMenu))

      await interaction.editReply({ embeds: [embed], components: buttonRows })
    } catch (error) {
      console.error("Error in shop select:", error)
      await interaction.followUp({ content: "❌ An error occurred.", ephemeral: true })
    }
  },

  /**
   * Handle item purchase button click
   * Deducts coins and adds item to inventory
   */
  async handleButton(interaction) {
    await interaction.deferReply({ ephemeral: true })
    try {
      const itemId = interaction.customId.split("_")[2]
      const userId = interaction.user.id

      // Get item from database
      const items = await getItems()
      const item = items.find((i) => i.id === itemId)

      if (!item) return interaction.editReply("❌ Item not found!")

      // Check user has enough coins
      const profile = await getProfile(userId, interaction.user.username)

      if (profile.coins < item.price) {
        return interaction.editReply(
          `❌ You don't have enough coins! You need **${item.price.toLocaleString()}** coins.`,
        )
      }

      // Deduct coins and add item to inventory
      await Promise.all([
        updateProfile(userId, { coins: profile.coins - item.price }),
        addToInventory(userId, itemId, 1),
        logTransaction({ userId, type: "shop_buy", amount: -item.price, itemId: itemId }),
      ])

      const embed = new EmbedBuilder()
        .setColor(RARITY_COLORS[item.rarity])
        .setTitle("✅ Purchase Successful!")
        .setDescription(`You bought **${item.name}** for **${item.price.toLocaleString()}** coins!`)
        .addFields(
          { name: "Remaining Balance", value: `${(profile.coins - item.price).toLocaleString()} coins`, inline: true },
          { name: "Item Added", value: item.name, inline: true },
        )
        .setFooter({ text: "Check your inventory with /inventory" })
        .setTimestamp()

      await interaction.editReply({ embeds: [embed] })
    } catch (error) {
      console.error("Error in shop buy:", error)
      await interaction.editReply("❌ An error occurred.")
    }
  },
}

// ============================================
// COMMAND: /inventory
// ============================================
// View items, sell for coins, or use consumables
const inventoryCommand = {
  data: new SlashCommandBuilder().setName("inventory").setDescription("View your inventory and manage items"),

  async execute(interaction) {
    await interaction.deferReply()
    try {
      const userId = interaction.user.id
      const inventory = await getInventory(userId)

      // Empty inventory check
      if (inventory.length === 0) {
        return interaction.editReply("📦 Your inventory is empty! Visit the shop with `/shop` to buy items.")
      }

      const embed = new EmbedBuilder()
        .setColor("#9B59B6")
        .setTitle(`${interaction.user.username}'s Inventory`)
        .setDescription(`You have **${inventory.length}** different items`)
        .setFooter({ text: "Click buttons below to sell or use items" })

      // Display each inventory item
      for (const invItem of inventory) {
        const item = invItem.items
        const rarityEmoji = RARITY_EMOJIS[item.rarity]
        const sellPrice = Math.floor(item.price * 0.6) // 60% sell value

        let effectText = ""
        if (item.effect) {
          effectText = item.effect.type === "consumable" ? " 🧪 *Consumable*" : " ✨ *Active*"
        }

        embed.addFields({
          name: `${rarityEmoji} ${item.name} x${invItem.quantity}`,
          value: `${item.description}${effectText}\n💰 Sell for: ${sellPrice.toLocaleString()} coins`,
          inline: false,
        })
      }

      // Create action buttons for items
      const buttons = []
      for (let i = 0; i < Math.min(inventory.length, 10); i++) {
        const invItem = inventory[i]
        const item = invItem.items

        // Add "Use" button for consumables
        if (item.effect && item.effect.type === "consumable") {
          buttons.push(
            new ButtonBuilder()
              .setCustomId(`inventory_use_${invItem.id}`)
              .setLabel(`Use ${item.name}`)
              .setStyle(ButtonStyle.Primary),
          )
        }

        // Add "Sell" button for all items
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`inventory_sell_${invItem.id}`)
            .setLabel(`Sell ${item.name}`)
            .setStyle(ButtonStyle.Danger),
        )
      }

      // Organize buttons into rows
      const rows = []
      for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)))
      }

      await interaction.editReply({ embeds: [embed], components: rows.slice(0, 5) })
    } catch (error) {
      console.error("Error in /inventory:", error)
      await interaction.editReply("❌ An error occurred.")
    }
  },

  /**
   * Handle inventory button actions (sell/use)
   */
  async handleButton(interaction) {
    await interaction.deferReply({ ephemeral: true })
    try {
      const [, action, invItemId] = interaction.customId.split("_")
      const userId = interaction.user.id

      // Get inventory and find item
      const inventory = await getInventory(userId)
      const invItem = inventory.find((i) => i.id === invItemId)

      if (!invItem) return interaction.editReply("❌ Item not found!")

      const item = invItem.items

      if (action === "sell") {
        // SELL: Remove item, add coins
        const sellPrice = Math.floor(item.price * 0.6)
        const profile = await getProfile(userId, interaction.user.username)

        await Promise.all([
          updateProfile(userId, { coins: profile.coins + sellPrice }),
          removeFromInventory(userId, item.id, 1),
          logTransaction({ userId, type: "shop_sell", amount: sellPrice, itemId: item.id }),
        ])

        const embed = new EmbedBuilder()
          .setColor("#00FF00")
          .setTitle("💰 Item Sold!")
          .setDescription(`You sold **${item.name}** for **${sellPrice.toLocaleString()}** coins!`)
          .addFields({
            name: "New Balance",
            value: `${(profile.coins + sellPrice).toLocaleString()} coins`,
            inline: true,
          })
          .setTimestamp()

        await interaction.editReply({ embeds: [embed] })
      } else if (action === "use") {
        // USE: Apply item effect and remove from inventory
        if (!item.effect || item.effect.type !== "consumable") {
          return interaction.editReply("❌ This item cannot be used!")
        }

        const profile = await getProfile(userId, interaction.user.username)
        let resultText = ""

        // Apply different effects based on item type
        switch (item.effect.effect) {
          case "xp_grant":
            // Grant XP and potentially level up
            const newXP = profile.xp + item.effect.value
            const newLevel = Math.floor(newXP / 1000) + 1
            await updateProfile(userId, { xp: newXP, level: newLevel })
            resultText = `You gained **${item.effect.value} XP**!`
            break
          case "daily_boost":
            // Grant bonus coins
            const boostAmount = 250
            await updateProfile(userId, { coins: profile.coins + boostAmount })
            resultText = `You received **${boostAmount}** coins!`
            break
          default:
            resultText = "Item used successfully!"
        }

        // Remove item from inventory
        await removeFromInventory(userId, item.id, 1)
        await logTransaction({ userId, type: "use_item", itemId: item.id, metadata: { effect: item.effect } })

        const embed = new EmbedBuilder()
          .setColor("#9B59B6")
          .setTitle("✨ Item Used!")
          .setDescription(`You used **${item.name}**!\n\n${resultText}`)
          .setTimestamp()

        await interaction.editReply({ embeds: [embed] })
      }
    } catch (error) {
      console.error("Error in inventory button:", error)
      await interaction.editReply("❌ An error occurred.")
    }
  },
}

// ============================================
// COMMAND: /leaderboard
// ============================================
// View top players by coins or XP with toggle buttons
const leaderboardCommand = {
  data: new SlashCommandBuilder().setName("leaderboard").setDescription("View the top players on the server"),

  async execute(interaction) {
    await interaction.deferReply()
    try {
      await showLeaderboard(interaction, "coins", false)
    } catch (error) {
      console.error("Error in /leaderboard:", error)
      await interaction.editReply("❌ An error occurred.")
    }
  },

  /**
   * Handle leaderboard toggle buttons (coins/xp)
   */
  async handleButton(interaction) {
    const type = interaction.customId.split("_")[1]
    await showLeaderboard(interaction, type, true)
  },
}

/**
 * Display leaderboard embed with top 10 players
 * @param {Object} interaction - Discord interaction
 * @param {string} type - "coins" or "xp"
 * @param {boolean} isUpdate - Whether to update existing message
 */
async function showLeaderboard(interaction, type, isUpdate) {
  const leaderboard = await getLeaderboard(type, 10)
  const rankEmojis = ["🥇", "🥈", "🥉"]

  // Build leaderboard text
  let description = ""
  for (let i = 0; i < leaderboard.length; i++) {
    const user = leaderboard[i]
    const rank = i < 3 ? rankEmojis[i] : `\`#${i + 1}\`` // Medals for top 3
    const value =
      type === "coins" ? `💰 ${user.coins.toLocaleString()}` : `⭐ ${user.xp.toLocaleString()} XP (Level ${user.level})`
    description += `${rank} **${user.username}** - ${value}\n`
  }

  const embed = new EmbedBuilder()
    .setColor("#FFD700")
    .setTitle(`🏆 ${type === "coins" ? "Richest" : "Top XP"} Players`)
    .setDescription(description || "No players found")
    .setTimestamp()

  // Create toggle buttons
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("leaderboard_coins")
      .setLabel("💰 Top Coins")
      .setStyle(type === "coins" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(type === "coins"),
    new ButtonBuilder()
      .setCustomId("leaderboard_xp")
      .setLabel("⭐ Top XP")
      .setStyle(type === "xp" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(type === "xp"),
  )

  if (isUpdate) {
    await interaction.update({ embeds: [embed], components: [row] })
  } else {
    await interaction.editReply({ embeds: [embed], components: [row] })
  }
}

// ============================================
// COMMAND: /profile
// ============================================
// Shows complete player stats, inventory value, and net worth
const profileCommand = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your detailed profile")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to view (leave empty for yourself)").setRequired(false),
    ),

  async execute(interaction) {
    await interaction.deferReply()
    try {
      const targetUser = interaction.options.getUser("user") || interaction.user
      const [profile, inventory] = await Promise.all([
        getProfile(targetUser.id, targetUser.username),
        getInventory(targetUser.id),
      ])

      // Calculate XP progress
      const currentLevelXP = (profile.level - 1) * 1000
      const nextLevelXP = profile.level * 1000
      const progressXP = profile.xp - currentLevelXP
      const requiredXP = nextLevelXP - currentLevelXP

      // Calculate inventory stats
      const totalItems = inventory.reduce((sum, item) => sum + item.quantity, 0)
      const uniqueItems = inventory.length

      // Calculate net worth (coins + inventory value)
      let inventoryValue = 0
      for (const invItem of inventory) {
        inventoryValue += invItem.items.price * invItem.quantity
      }
      const netWorth = profile.coins + inventoryValue

      const embed = new EmbedBuilder()
        .setColor("#3498db")
        .setTitle(`${targetUser.username}'s Profile`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: "💰 Coins", value: profile.coins.toLocaleString(), inline: true },
          { name: "💎 Net Worth", value: netWorth.toLocaleString(), inline: true },
          { name: "📊 Level", value: `${profile.level}`, inline: true },
          { name: "⭐ Total XP", value: profile.xp.toLocaleString(), inline: true },
          { name: "📈 Progress", value: `${progressXP}/${requiredXP} XP`, inline: true },
          { name: "🔥 Daily Streak", value: `${profile.daily_streak} days`, inline: true },
          { name: "📦 Inventory", value: `${totalItems} items (${uniqueItems} unique)`, inline: true },
          { name: "🎯 Robberies", value: `${profile.rob_attempts} attempts`, inline: true },
          { name: "📅 Joined", value: new Date(profile.created_at).toLocaleDateString(), inline: true },
        )
        .setFooter({ text: `User ID: ${targetUser.id}` })
        .setTimestamp()

      await interaction.editReply({ embeds: [embed] })
    } catch (error) {
      console.error("Error in /profile:", error)
      await interaction.editReply("❌ An error occurred.")
    }
  },
}

// ============================================
// COMMAND: /help
// ============================================
// Shows command list and game mechanics explanation
const helpCommand = {
  data: new SlashCommandBuilder().setName("help").setDescription("View all commands and game information"),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor("#3498db")
      .setTitle("📚 Astryx Economy - Command List")
      .setDescription("Welcome to Astryx Economy! Here are all available commands:")
      .addFields(
        {
          name: "💰 Economy Commands",
          value:
            "`/daily` - Claim your daily reward (streak bonuses!)\n" +
            "`/work` - Work to earn coins (boosted by tools)\n" +
            "`/balance` - Check your or another user's balance\n" +
            "`/pay <user> <amount>` - Transfer coins to another player\n" +
            "`/rob <user>` - Attempt to rob another player (risky!)",
          inline: false,
        },
        {
          name: "🏪 Shop & Inventory",
          value:
            "`/shop` - Browse and buy items\n" +
            "`/inventory` - View and manage your items\n" +
            "`/profile [user]` - View detailed profile stats",
          inline: false,
        },
        {
          name: "🏆 Competition",
          value: "`/leaderboard` - View top players\n" + "`/help` - Show this help message",
          inline: false,
        },
        {
          name: "📊 Game Mechanics",
          value:
            "• **Leveling**: Earn XP from commands (1000 XP per level)\n" +
            "• **Daily Streaks**: Up to +500 bonus coins\n" +
            "• **Tools**: Boost work earnings\n" +
            "• **Weapons**: Protect from robberies\n" +
            "• **Cooldowns**: Daily (24h), Work (4h), Rob (12h)",
          inline: false,
        },
      )
      .setFooter({ text: "Astryx Economy | Have fun!" })
      .setTimestamp()

    await interaction.reply({ embeds: [embed] })
  },
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format item effect for display in embeds
 * Converts effect objects to readable strings
 * @param {Object} effect - Item effect object
 * @returns {string} Formatted effect description
 *
 * Effect formatting for UI display
 * Shows readable descriptions of item effects
 */
function formatEffect(effect) {
  if (!effect) return "None"
  switch (effect.type) {
    case "work_boost":
      return `+${Math.floor(effect.value * 100)}% work earnings`
    case "rob_defense":
      return `${Math.floor(effect.value * 100)}% robbery protection`
    case "cooldown_reduction":
      return `-${effect.value}h ${effect.command} cooldown`
    case "consumable":
      return effect.effect === "xp_grant" ? `+${effect.value} XP` : effect.effect
    case "passive":
      return effect.effect.replace("_", " ")
    default:
      return "Special effect"
  }
}

// ============================================
// BOT INITIALIZATION & EVENT HANDLERS
// ============================================

/**
 * Discord bot client creation
 * Configures intents for receiving guild and message events
 * Intents allow bot to receive specific types of events
 */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, // Receive guild events
    GatewayIntentBits.GuildMessages, // Receive message events
    GatewayIntentBits.MessageContent, // Access message content
  ],
})

// Store commands in collection for quick access
client.commands = new Collection()

/**
 * Register all commands into collection
 * Maps command name to command object for interaction handling
 */
const commands = [
  dailyCommand,
  workCommand,
  balanceCommand,
  payCommand,
  robCommand,
  shopCommand,
  inventoryCommand,
  leaderboardCommand,
  profileCommand,
  helpCommand,
]

for (const command of commands) {
  client.commands.set(command.data.name, command)
}

/**
 * Bot ready event
 * Fires when bot successfully connects and is ready to receive events
 * Registers all slash commands with Discord API
 */
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`)

  // Register slash commands with Discord API using REST
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN)

  try {
    console.log("🔄 Registering slash commands...")
    // PUT request to register commands globally
    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), {
      body: commands.map((cmd) => cmd.data.toJSON()),
    })
    console.log("✅ Successfully registered slash commands!")
  } catch (error) {
    console.error("❌ Failed to register commands:", error)
  }

  // Set bot activity/status
  client.user.setActivity("Astryx Economy | /help")
})

/**
 * Interaction handler
 * Routes interactions to appropriate handlers
 * Handles slash commands, buttons, and select menus
 */
client.on("interactionCreate", async (interaction) => {
  // Handle slash command interactions
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName)
    if (!command) return

    try {
      await command.execute(interaction)
    } catch (error) {
      console.error(`Error in /${interaction.commandName}:`, error)
      const msg = { content: "❌ An error occurred.", ephemeral: true }
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg)
      } else {
        await interaction.reply(msg)
      }
    }
  }

  // Handle button click interactions
  if (interaction.isButton()) {
    const commandName = interaction.customId.split("_")[0]
    const command = client.commands.get(commandName)
    if (command && command.handleButton) {
      try {
        await command.handleButton(interaction)
      } catch (error) {
        console.error(`Error in button ${interaction.customId}:`, error)
      }
    }
  }

  // Handle select menu interactions
  if (interaction.isStringSelectMenu()) {
    const commandName = interaction.customId.split("_")[0]
    const command = client.commands.get(commandName)
    if (command && command.handleSelect) {
      try {
        await command.handleSelect(interaction)
      } catch (error) {
        console.error(`Error in select ${interaction.customId}:`, error)
      }
    }
  }
})

/**
 * Global error handlers
 * Catch unhandled promise rejections and exceptions
 * Prevents bot from crashing
 */
process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error)
})

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error)
  process.exit(1)
})

/**
 * Bot login
 * Connects bot to Discord using token from .env
 */
client.login(process.env.DISCORD_TOKEN)

