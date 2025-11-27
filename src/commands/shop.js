import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js"
import { getItems, getProfile, updateProfile, addToInventory, logTransaction } from "../database.js"

/**
 * /shop Command
 * Browse and purchase items from the shop
 */

const RARITY_COLORS = {
  common: "#95A5A6",
  uncommon: "#2ECC71",
  rare: "#3498DB",
  epic: "#9B59B6",
  legendary: "#F39C12",
}

const RARITY_EMOJIS = {
  common: "⚪",
  uncommon: "🟢",
  rare: "🔵",
  epic: "🟣",
  legendary: "🟠",
}

export const data = new SlashCommandBuilder().setName("shop").setDescription("Browse the shop and buy items")

export async function execute(interaction) {
  await interaction.deferReply()

  try {
    // Get all items
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
        {
          label: "🔧 Tools",
          description: "Items that boost work rewards",
          value: "tools",
        },
        {
          label: "⚔️ Weapons",
          description: "Protection against robberies",
          value: "weapons",
        },
        {
          label: "🎨 Collectibles",
          description: "Rare items for collection",
          value: "collectibles",
        },
        {
          label: "🧪 Consumables",
          description: "Single-use items with special effects",
          value: "consumables",
        },
        {
          label: "⭐ Upgrades",
          description: "Permanent passive bonuses",
          value: "upgrades",
        },
      ])

    const row = new ActionRowBuilder().addComponents(selectMenu)

    // Show initial shop page with all categories overview
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
    console.error("Error in /shop command:", error)
    await interaction.editReply("❌ An error occurred while loading the shop.")
  }
}

/**
 * Handle category selection
 */
export async function handleSelect(interaction) {
  await interaction.deferUpdate()

  try {
    const category = interaction.values[0]
    const items = await getItems(category)

    // Create embeds for items (max 10 per page)
    const itemsPerPage = 5
    const pages = []

    for (let i = 0; i < items.length; i += itemsPerPage) {
      const pageItems = items.slice(i, i + itemsPerPage)

      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle(`🏪 ${category.charAt(0).toUpperCase() + category.slice(1)} Shop`)
        .setDescription(`Page ${pages.length + 1}/${Math.ceil(items.length / itemsPerPage)}`)
        .setFooter({ text: "Click a button below to purchase an item" })

      for (const item of pageItems) {
        const rarityEmoji = RARITY_EMOJIS[item.rarity]
        const effectText = item.effect ? formatEffect(item.effect) : "No special effect"

        embed.addFields({
          name: `${rarityEmoji} ${item.name} - ${item.price.toLocaleString()} coins`,
          value: `${item.description}\n*Effect: ${effectText}*`,
          inline: false,
        })
      }

      pages.push({ embed, items: pageItems })
    }

    // Create purchase buttons for first page
    const buttons = pages[0].items
      .slice(0, 5)
      .map((item) =>
        new ButtonBuilder()
          .setCustomId(`shop_buy_${item.id}`)
          .setLabel(`Buy ${item.name}`)
          .setStyle(ButtonStyle.Success),
      )

    const buttonRows = []
    for (let i = 0; i < buttons.length; i += 5) {
      buttonRows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)))
    }

    // Add category select menu at the end
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

    await interaction.editReply({
      embeds: [pages[0].embed],
      components: buttonRows,
    })
  } catch (error) {
    console.error("Error in shop category selection:", error)
    await interaction.followUp({ content: "❌ An error occurred while loading items.", ephemeral: true })
  }
}

/**
 * Handle purchase button
 */
export async function handleButton(interaction) {
  await interaction.deferReply({ ephemeral: true })

  try {
    const itemId = interaction.customId.split("_")[2]
    const userId = interaction.user.id

    // Get user profile and item
    const items = await getItems()
    const item = items.find((i) => i.id === itemId)

    if (!item) {
      return interaction.editReply("❌ Item not found!")
    }

    const profile = await getProfile(userId, interaction.user.username)

    // Check if user has enough coins
    if (profile.coins < item.price) {
      return interaction.editReply(
        `❌ You don't have enough coins! You need **${item.price.toLocaleString()}** coins but only have **${profile.coins.toLocaleString()}**.`,
      )
    }

    // Process purchase
    await Promise.all([
      updateProfile(userId, { coins: profile.coins - item.price }),
      addToInventory(userId, itemId, 1),
      logTransaction({
        userId,
        type: "shop_buy",
        amount: -item.price,
        itemId: itemId,
      }),
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
    console.error("Error in shop purchase:", error)
    await interaction.editReply("❌ An error occurred while processing your purchase.")
  }
}

/**
 * Format item effect for display
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
