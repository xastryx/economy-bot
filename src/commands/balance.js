import { SlashCommandBuilder, EmbedBuilder } from "discord.js"
import { getProfile } from "../database.js"

/**
 * /balance Command
 * Check your or another user's balance and stats
 */

export const data = new SlashCommandBuilder()
  .setName("balance")
  .setDescription("Check your balance and stats")
  .addUserOption((option) =>
    option.setName("user").setDescription("User to check (leave empty for yourself)").setRequired(false),
  )

export async function execute(interaction) {
  await interaction.deferReply()

  try {
    const targetUser = interaction.options.getUser("user") || interaction.user
    const profile = await getProfile(targetUser.id, targetUser.username)

    // Calculate progress to next level
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
    console.error("Error in /balance command:", error)
    await interaction.editReply("❌ An error occurred while fetching balance.")
  }
}
