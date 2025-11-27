import { SlashCommandBuilder, EmbedBuilder } from "discord.js"
import { getProfile, getInventory } from "../database.js"

/**
 * /profile Command
 * View detailed profile information
 */

export const data = new SlashCommandBuilder()
  .setName("profile")
  .setDescription("View your detailed profile")
  .addUserOption((option) =>
    option.setName("user").setDescription("User to view (leave empty for yourself)").setRequired(false),
  )

export async function execute(interaction) {
  await interaction.deferReply()

  try {
    const targetUser = interaction.options.getUser("user") || interaction.user
    const [profile, inventory] = await Promise.all([
      getProfile(targetUser.id, targetUser.username),
      getInventory(targetUser.id),
    ])

    // Calculate stats
    const currentLevelXP = (profile.level - 1) * 1000
    const nextLevelXP = profile.level * 1000
    const progressXP = profile.xp - currentLevelXP
    const requiredXP = nextLevelXP - currentLevelXP

    const totalItems = inventory.reduce((sum, item) => sum + item.quantity, 0)
    const uniqueItems = inventory.length

    // Calculate net worth (coins + inventory value)
    let inventoryValue = 0
    for (const invItem of inventory) {
      inventoryValue += invItem.items.price * invItem.quantity
    }
    const netWorth = profile.coins + inventoryValue

    // Create embed
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
    console.error("Error in /profile command:", error)
    await interaction.editReply("❌ An error occurred while loading the profile.")
  }
}
