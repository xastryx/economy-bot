import { SlashCommandBuilder, EmbedBuilder } from "discord.js"

/**
 * /help Command
 * Display all available commands and game information
 */

export const data = new SlashCommandBuilder().setName("help").setDescription("View all commands and game information")

export async function execute(interaction) {
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
          "`/shop` - Browse and buy items from the shop\n" +
          "`/inventory` - View and manage your items\n" +
          "`/profile [user]` - View detailed profile stats",
        inline: false,
      },
      {
        name: "🏆 Competition",
        value: "`/leaderboard` - View top players by coins or XP\n" + "`/help` - Show this help message",
        inline: false,
      },
      {
        name: "📊 Game Mechanics",
        value:
          "• **Leveling**: Earn XP from commands to level up (1000 XP per level)\n" +
          "• **Daily Streaks**: Claim daily for up to +500 bonus coins\n" +
          "• **Tools**: Buy tools to boost work earnings\n" +
          "• **Weapons**: Protect yourself from robberies\n" +
          "• **Consumables**: One-time use items with special effects\n" +
          "• **Cooldowns**: Daily (24h), Work (4h), Rob (12h)",
        inline: false,
      },
      {
        name: "💡 Tips",
        value:
          "• Keep a daily streak for maximum rewards\n" +
          "• Buy tools early to increase work earnings\n" +
          "• Invest in weapons to protect your coins\n" +
          "• Rob carefully - failed attempts cost coins!\n" +
          "• Sell items you don't need for 60% value",
        inline: false,
      },
    )
    .setFooter({ text: "Astryx Economy | Have fun and play fair!" })
    .setTimestamp()

  await interaction.reply({ embeds: [embed] })
}
