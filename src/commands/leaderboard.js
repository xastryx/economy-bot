import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js"
import { getLeaderboard } from "../database.js"

/**
 * /leaderboard Command
 * View top users by coins or XP
 */

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("View the top players on the server")

export async function execute(interaction) {
  await interaction.deferReply()

  try {
    await showLeaderboard(interaction, "coins", false)
  } catch (error) {
    console.error("Error in /leaderboard command:", error)
    await interaction.editReply("❌ An error occurred while loading the leaderboard.")
  }
}

/**
 * Show leaderboard embed
 */
async function showLeaderboard(interaction, type, isUpdate) {
  const leaderboard = await getLeaderboard(type, 10)

  const rankEmojis = ["🥇", "🥈", "🥉"]

  const embed = new EmbedBuilder()
    .setColor("#FFD700")
    .setTitle(`🏆 ${type === "coins" ? "Richest" : "Top XP"} Players`)
    .setDescription(`Top 10 players ranked by ${type}`)
    .setTimestamp()

  // Add leaderboard entries
  let description = ""
  for (let i = 0; i < leaderboard.length; i++) {
    const user = leaderboard[i]
    const rank = i < 3 ? rankEmojis[i] : `\`#${i + 1}\``
    const value =
      type === "coins" ? `💰 ${user.coins.toLocaleString()}` : `⭐ ${user.xp.toLocaleString()} XP (Level ${user.level})`

    description += `${rank} **${user.username}** - ${value}\n`
  }

  embed.setDescription(description || "No players found")

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

/**
 * Handle leaderboard button toggle
 */
export async function handleButton(interaction) {
  const type = interaction.customId.split("_")[1]
  await showLeaderboard(interaction, type, true)
}
