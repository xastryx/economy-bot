import { SlashCommandBuilder, EmbedBuilder } from "discord.js"
import { getProfile, updateProfile, logTransaction } from "../database.js"

/**
 * /pay Command
 * Transfer coins to another user
 */

export const data = new SlashCommandBuilder()
  .setName("pay")
  .setDescription("Transfer coins to another user")
  .addUserOption((option) => option.setName("user").setDescription("User to pay").setRequired(true))
  .addIntegerOption((option) =>
    option.setName("amount").setDescription("Amount of coins to transfer").setRequired(true).setMinValue(1),
  )

export async function execute(interaction) {
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

    // Get profiles
    const [senderProfile, recipientProfile] = await Promise.all([
      getProfile(sender.id, sender.username),
      getProfile(recipient.id, recipient.username),
    ])

    // Check if sender has enough coins
    if (senderProfile.coins < amount) {
      return interaction.editReply(`❌ You don't have enough coins! You have **${senderProfile.coins}** coins.`)
    }

    // Process transfer
    await Promise.all([
      updateProfile(sender.id, { coins: senderProfile.coins - amount }),
      updateProfile(recipient.id, { coins: recipientProfile.coins + amount }),
    ])

    // Log transactions
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

    // Create response embed
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
    console.error("Error in /pay command:", error)
    await interaction.editReply("❌ An error occurred while processing the payment.")
  }
}
