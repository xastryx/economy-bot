import { REST, Routes } from "discord.js"
import { readdirSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Load and register all slash commands
 * @param {Client} client - Discord client instance
 */
export async function loadCommands(client) {
  const commands = []
  const commandFiles = readdirSync(__dirname).filter((file) => file.endsWith(".js") && file !== "index.js")

  // Load each command file
  for (const file of commandFiles) {
    const filePath = join(__dirname, file)
    const command = await import(`file://${filePath}`)

    if (command.data && command.execute) {
      client.commands.set(command.data.name, command)
      commands.push(command.data.toJSON())
      console.log(`✅ Loaded command: ${command.data.name}`)
    }
  }

  // Register commands with Discord
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN)

  try {
    console.log(`🔄 Registering ${commands.length} slash commands...`)

    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands })

    console.log("✅ Successfully registered slash commands!")
  } catch (error) {
    console.error("❌ Failed to register slash commands:", error)
  }
}
