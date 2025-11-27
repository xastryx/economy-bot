import { SlashCommandBuilder, EmbedBuilder } from "discord.js"
import {
  getProfile,
  updateProfile,
  checkCooldown,
  setCooldown,
  logTransaction,
  getServerSettings,
} from "../database.js"

/**
 * /daily Command
 * Claim daily rewards with streak bonuses
 */

export const data = new SlashCommandBuilder()
  .setName("daily")
  .setDescription("Claim your daily reward with streak bonuses")

export async function execute(interaction) {
  await interaction.deferReply()

  try {
    const userId = interaction.user.id
    const username = interaction.user.username

    // Check cooldown
    const cooldown = await checkCooldown(userId, "daily")
    if (cooldown.onCooldown) {
      const timeLeft = Math.ceil((cooldown.expiresAt - new Date()) / 1000 / 60 / 60)
      return interaction.editReply(`⏰ You can claim your daily reward in **${timeLeft}** hours.`)
    }

    // Get user profile and server settings
    const [profile, settings] = await Promise.all([getProfile(userId, username), getServerSettings()])

    // Calculate streak
    const now = new Date()
    const lastDaily = profile.last_daily ? new Date(profile.last_daily) : null
    let newStreak = 0

    if (lastDaily) {
      const hoursSinceDaily = (now - lastDaily) / 1000 / 60 / 60

      // If claimed within 24-48 hours, continue streak
      if (hoursSinceDaily >= 24 && hoursSinceDaily <= 48) {
        newStreak = profile.daily_streak + 1
      } else if (hoursSinceDaily < 24) {
        // Too soon, shouldn't happen with cooldown
        return interaction.editReply("⏰ You already claimed your daily reward!")
      }
      // Streak broken if > 48 hours
    }

    // Calculate reward with streak bonus
    const baseAmount = settings.daily_amount
    const streakBonus = Math.min(newStreak * 50, 500) // Max 500 bonus (10 day streak)
    const totalAmount = baseAmount + streakBonus

    // Add XP (10 per daily)
    const xpGain = 10
    const newXP = profile.xp + xpGain
    const newLevel = Math.floor(newXP / 1000) + 1

    // Update profile
    await updateProfile(userId, {
      coins: profile.coins + totalAmount,
      xp: newXP,
      level: newLevel,
      daily_streak: newStreak,
      last_daily: now.toISOString(),
    })

    // Set cooldown
    await setCooldown(userId, "daily", settings.daily_cooldown_hours)

    // Log transaction
    await logTransaction({
      userId,
      type: "daily",
      amount: totalAmount,
      metadata: { streak: newStreak, xp_gain: xpGain },
    })

    // Create response embed
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
    console.error("Error in /daily command:", error)
    await interaction.editReply("❌ An error occurred while processing your daily reward.")
  }
}
