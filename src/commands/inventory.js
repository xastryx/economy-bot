import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js"
import { getInventory, getProfile, updateProfile, removeFromInventory, logTransaction } from "../database.js"

/**
 * /inventory Command
 * View and manage your items
 */

const RARITY_EMOJIS = {
  common: "⚪",
  uncommon: "🟢",
  rare: "🔵",
  epic: "🟣",
  legendary: "🟠",
}

export const data = new SlashCommandBuilder()
  .setName("inventory")
  .setDescription("View your inventory and manage items")

export async function execute(interaction) {
  await interaction.deferReply()

  try {
    const userId = interaction.user.id
    const inventory = await getInventory(userId)

    if (inventory.length === 0) {
      return interaction.editReply("📦 Your inventory is empty! Visit the shop with `/shop` to buy items.")
    }

    // Create inventory embed
    const embed = new EmbedBuilder()
      .setColor("#9B59B6")
      .setTitle(`${interaction.user.username}'s Inventory`)
      .setDescription(`You have **${inventory.length}** different items`)
      .setFooter({ text: "Click buttons below to sell or use items" })

    // Add fields for each item
    for (const invItem of inventory) {
      const item = invItem.items
      const rarityEmoji = RARITY_EMOJIS[item.rarity]
      const sellPrice = Math.floor(item.price * 0.6)

      let effectText = ""
      if (item.effect) {
        if (item.effect.type === "consumable") {
          effectText = " 🧪 *Consumable*"
        } else {
          effectText = ` ✨ *Active*`
        }
      }

      embed.addFields({
        name: `${rarityEmoji} ${item.name} x${invItem.quantity}`,
        value: `${item.description}${effectText}\n💰 Sell for: ${sellPrice.toLocaleString()} coins`,
        inline: false,
      })
    }

    // Create buttons (max 25 buttons across 5 rows)
    const buttons = []
    for (let i = 0; i < Math.min(inventory.length, 10); i++) {
      const invItem = inventory[i]
      const item = invItem.items

      // Add use button for consumables
      if (item.effect && item.effect.type === "consumable") {
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`inventory_use_${invItem.id}`)
            .setLabel(`Use ${item.name}`)
            .setStyle(ButtonStyle.Primary),
        )
      }

      // Add sell button
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`inventory_sell_${invItem.id}`)
          .setLabel(`Sell ${item.name}`)
          .setStyle(ButtonStyle.Danger),
      )
    }

    // Organize buttons into rows (max 5 buttons per row)
    const rows = []
    for (let i = 0; i < buttons.length; i += 5) {
      rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)))
    }

    await interaction.editReply({
      embeds: [embed],
      components: rows.slice(0, 5), // Max 5 rows
    })
  } catch (error) {
    console.error("Error in /inventory command:", error)
    await interaction.editReply("❌ An error occurred while loading your inventory.")
  }
}

/**
 * Handle inventory button interactions
 */
export async function handleButton(interaction) {
  await interaction.deferReply({ ephemeral: true })

  try {
    const [, action, invItemId] = interaction.customId.split("_")
    const userId = interaction.user.id

    // Get inventory item
    const inventory = await getInventory(userId)
    const invItem = inventory.find((i) => i.id === invItemId)

    if (!invItem) {
      return interaction.editReply("❌ Item not found in your inventory!")
    }

    const item = invItem.items

    if (action === "sell") {
      // Sell item for 60% of original price
      const sellPrice = Math.floor(item.price * 0.6)
      const profile = await getProfile(userId, interaction.user.username)

      await Promise.all([
        updateProfile(userId, { coins: profile.coins + sellPrice }),
        removeFromInventory(userId, item.id, 1),
        logTransaction({
          userId,
          type: "shop_sell",
          amount: sellPrice,
          itemId: item.id,
        }),
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

      // Update main inventory message
      if (invItem.quantity === 1) {
        await interaction.message.edit({ content: "🔄 Inventory updated. Use `/inventory` to view again." })
      }
    } else if (action === "use") {
      // Use consumable item
      if (!item.effect || item.effect.type !== "consumable") {
        return interaction.editReply("❌ This item cannot be used!")
      }

      const profile = await getProfile(userId, interaction.user.username)
      let resultText = ""

      // Apply consumable effect
      switch (item.effect.effect) {
        case "xp_grant":
          const newXP = profile.xp + item.effect.value
          const newLevel = Math.floor(newXP / 1000) + 1
          await updateProfile(userId, { xp: newXP, level: newLevel })
          resultText = `You gained **${item.effect.value} XP**! ${newLevel > profile.level ? `\n🎉 Level up! You're now level ${newLevel}!` : ""}`
          break

        case "daily_boost":
          // This would need special handling, for now just give coins
          const boostAmount = 250
          await updateProfile(userId, { coins: profile.coins + boostAmount })
          resultText = `You received a **${boostAmount}** coin bonus!`
          break

        case "cooldown_restore":
          // Remove cooldown
          resultText = `Your **${item.effect.command}** cooldown was reduced by ${item.effect.value} hour(s)!`
          break

        default:
          resultText = "Item used successfully!"
      }

      // Remove item from inventory
      await removeFromInventory(userId, item.id, 1)

      await logTransaction({
        userId,
        type: "use_item",
        itemId: item.id,
        metadata: { effect: item.effect },
      })

      const embed = new EmbedBuilder()
        .setColor("#9B59B6")
        .setTitle("✨ Item Used!")
        .setDescription(`You used **${item.name}**!\n\n${resultText}`)
        .setTimestamp()

      await interaction.editReply({ embeds: [embed] })

      // Update main inventory message
      if (invItem.quantity === 1) {
        await interaction.message.edit({ content: "🔄 Inventory updated. Use `/inventory` to view again." })
      }
    }
  } catch (error) {
    console.error("Error in inventory button handler:", error)
    await interaction.editReply("❌ An error occurred while processing your request.")
  }
}
