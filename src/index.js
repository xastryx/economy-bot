import { Client, GatewayIntentBits, Collection } from "discord.js"
import { config } from "dotenv"
import { loadCommands } from "./commands/index.js"

// Load environment variables
config()

/**
 * Main Discord Bot Entry Point
 * Initializes the bot, loads commands, and handles events
 */

// Create Discord client with required intents
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
})

// Store commands in a collection for easy access
client.commands = new Collection()

/**
 * Bot Ready Event
 * Triggered when the bot successfully connects to Discord
 */
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`)

  // Load all slash commands
  await loadCommands(client)

  // Set bot activity status
  client.user.setActivity("Astryx Economy | /help", { type: "PLAYING" })
})

/**
 * Interaction Handler
 * Handles all slash command interactions
 */
client.on("interactionCreate", async (interaction) => {
  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName)

    if (!command) {
      return interaction.reply({ content: "❌ Command not found!", ephemeral: true })
    }

    try {
      // Execute the command
      await command.execute(interaction)
    } catch (error) {
      console.error(`Error executing ${interaction.commandName}:`, error)

      const errorMessage = { content: "❌ An error occurred while executing this command.", ephemeral: true }

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage)
      } else {
        await interaction.reply(errorMessage)
      }
    }
  }

  // Handle button interactions (for shop, inventory, leaderboards)
  if (interaction.isButton()) {
    const command = client.commands.get(interaction.customId.split("_")[0])

    if (command && command.handleButton) {
      try {
        await command.handleButton(interaction)
      } catch (error) {
        console.error(`Error handling button ${interaction.customId}:`, error)
        await interaction.reply({ content: "❌ An error occurred while processing this button.", ephemeral: true })
      }
    }
  }

  // Handle select menu interactions (for shop categories)
  if (interaction.isStringSelectMenu()) {
    const command = client.commands.get(interaction.customId.split("_")[0])

    if (command && command.handleSelect) {
      try {
        await command.handleSelect(interaction)
      } catch (error) {
        console.error(`Error handling select menu ${interaction.customId}:`, error)
        await interaction.reply({ content: "❌ An error occurred while processing this selection.", ephemeral: true })
      }
    }
  }
})

/**
 * Error Handlers
 * Catch and log any unhandled errors
 */
process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error)
})

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error)
  process.exit(1)
})

// Login to Discord
client.login(process.env.DISCORD_TOKEN)
