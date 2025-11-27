import { SlashCommandBuilder, EmbedBuilder } from "discord.js"
import {
  getProfile,
  updateProfile,
  checkCooldown,
  setCooldown,
  logTransaction,
  getServerSettings,
  getInventory,
} from "../database.js"

/**
 * /work Command
 * Work for coins with tool boosts and cooldown reduction
 */

export const data = new SlashCommandBuilder()
  .setName("work")
  .setDescription("Work to earn coins (affected by tools in your inventory)")

export async function execute(interaction) {
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

    // Get user data
    const [profile, settings, inventory] = await Promise.all([
      getProfile(userId, username),
      getServerSettings(),
      getInventory(userId),
    ])

    // Calculate base work amount (random between min and max)
    const baseAmount = Math.floor(
      Math.random() * (settings.work_max_amount - settings.work_min_amount + 1) + settings.work_min_amount,
    )

    // Calculate boost from tools
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

    const boostAmount = Math.floor(baseAmount * totalBoost)
    const totalAmount = baseAmount + boostAmount

    // Calculate XP gain (1 XP per 10 coins)
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

    // Check for cooldown reduction items
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

    // Create response embed
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
    console.error("Error in /work command:", error)
    await interaction.editReply("❌ An error occurred while processing your work.")
  }
}
