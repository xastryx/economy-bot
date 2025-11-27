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
 * /rob Command
 * Attempt to rob another user with success rate based on weapons
 */

export const data = new SlashCommandBuilder()
  .setName("rob")
  .setDescription("Attempt to rob another user (risky!)")
  .addUserOption((option) => option.setName("user").setDescription("User to rob").setRequired(true))

export async function execute(interaction) {
  await interaction.deferReply()

  try {
    const robber = interaction.user
    const target = interaction.options.getUser("user")

    // Validation checks
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

    // Get profiles and settings
    const [robberProfile, targetProfile, settings, robberInventory, targetInventory] = await Promise.all([
      getProfile(robber.id, robber.username),
      getProfile(target.id, target.username),
      getServerSettings(),
      getInventory(robber.id),
      getInventory(target.id),
    ])

    // Check minimum balance
    if (targetProfile.coins < 500) {
      return interaction.editReply(`❌ **${target.username}** doesn't have enough coins to rob (minimum 500).`)
    }

    if (robberProfile.coins < 100) {
      return interaction.editReply("❌ You need at least **100 coins** to attempt a robbery.")
    }

    // Calculate rob defense from target's weapons
    let targetDefense = 0
    for (const invItem of targetInventory) {
      const effect = invItem.items.effect
      if (effect && effect.type === "rob_defense") {
        targetDefense = Math.max(targetDefense, effect.value)
      }
    }

    // Calculate success rate (base rate - target defense)
    const baseSuccessRate = Number.parseFloat(settings.rob_success_rate)
    const actualSuccessRate = Math.max(0.1, baseSuccessRate - targetDefense) // Min 10% success
    const success = Math.random() < actualSuccessRate

    // Calculate amount (10-30% of target's coins)
    const percentage = Math.random() * 0.2 + 0.1 // 10-30%
    const robAmount = Math.floor(targetProfile.coins * percentage)

    if (success) {
      // Successful robbery
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
          { name: "Your Balance", value: `${(robberProfile.coins + robAmount).toLocaleString()} coins`, inline: true },
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
      // Failed robbery - lose coins as penalty
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

    // Set cooldown
    await setCooldown(robber.id, "rob", settings.rob_cooldown_hours)
  } catch (error) {
    console.error("Error in /rob command:", error)
    await interaction.editReply("❌ An error occurred while processing the robbery.")
  }
}
