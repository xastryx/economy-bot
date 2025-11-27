# 🎮 Astryx Economy Discord Bot

A comprehensive Discord economy bot with commands, shop system, inventory management, and competitive leaderboards.

## Features

### 💰 Economy Commands
- **/daily** - Claim daily rewards with streak bonuses
- **/work** - Work for coins with tool boosts
- **/pay** - Transfer coins to other users
- **/rob** - Rob other users (high risk, high reward)

### 🏪 Shop & Inventory
- **5 Item Categories**: Tools, Weapons, Collectibles, Consumables, Upgrades
- **5 Rarity Tiers**: Common, Uncommon, Rare, Epic, Legendary
- **Item Effects**: Work boosts, rob defense, cooldown reduction, and more
- **Use & Sell**: Consume items or sell for 60% value

### 📊 Progression System
- **XP & Leveling**: Earn XP from all activities
- **Leaderboards**: Compete for top coins or XP rankings
- **Profiles**: Track stats, streaks, and account age

### 🛡️ Anti-Cheat
- **Transaction Logging**: All economy actions are logged
- **Cooldown System**: Prevents command spam
- **Configurable Settings**: Admins can adjust rates and rewards

## Installation

### 1. Prerequisites
- Node.js v18 or higher
- Discord Bot Token
- Supabase Account (PostgreSQL database)

### 2. Setup Discord Bot
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" tab and click "Add Bot"
4. Copy the bot token
5. Enable these Privileged Gateway Intents:
   - Server Members Intent
   - Message Content Intent
6. Go to "OAuth2 > URL Generator"
7. Select scopes: `bot`, `applications.commands`
8. Select bot permissions: `Send Messages`, `Embed Links`, `Read Message History`
9. Copy the generated URL and invite the bot to your server

### 3. Setup Supabase Database
The database schema has already been created via migrations in the `/scripts` folder:
- `001_create_economy_tables.sql` - Creates all tables with RLS
- `002_profile_trigger.sql` - Auto-creates profiles for new users
- `003_seed_items.sql` - Seeds shop with 25 items

These scripts have been executed. Get your Supabase credentials:
1. Go to your Supabase project
2. Go to Settings > API
3. Copy the `URL` and `service_role key` (NOT the anon key)

### 4. Install Dependencies
\`\`\`bash
npm install
\`\`\`

### 5. Configure Environment Variables
Create a `.env` file in the root directory:
\`\`\`env
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here
SUPABASE_URL=your_supabase_url_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
\`\`\`

**Note**: `DISCORD_CLIENT_ID` is found in Discord Developer Portal under "Application ID"

### 6. Run the Bot
Development mode (auto-restart on changes):
\`\`\`bash
npm run dev
\`\`\`

Production mode:
\`\`\`bash
npm start
\`\`\`

## Commands Reference

| Command | Description | Cooldown |
|---------|-------------|----------|
| `/daily` | Claim daily coins + streak bonus | 24 hours |
| `/work` | Work for coins (boosted by tools) | 4 hours |
| `/pay @user <amount>` | Send coins to another user | None |
| `/rob @user` | Attempt to rob another user | 12 hours |
| `/shop` | Browse shop items by category | None |
| `/inventory` | View and manage your items | None |
| `/balance [@user]` | Check coin balance | None |
| `/profile [@user]` | View detailed profile | None |
| `/leaderboard` | View top players (toggle coins/XP) | None |
| `/help` | Show command guide | None |

## Game Mechanics

### Daily Rewards
- Base reward: 500 coins (configurable)
- Streak bonus: +50 coins per consecutive day (max +500)
- Streak breaks after 48 hours of missing a claim
- Earn 10 XP per daily claim

### Work System
- Random rewards: 100-500 coins (configurable)
- Tool items provide percentage boosts
- Best tool applies (not stackable)
- Cooldown reduction items stack
- Earn XP: 1 XP per 10 coins

### Robbery Mechanics
- 40% base success rate (configurable)
- Success: Steal 10-30% of target's coins
- Failure: Lose 20% of your coins as penalty
- Weapons reduce attacker's success rate
- Target must have minimum 500 coins
- Attacker must have minimum 100 coins

### XP & Leveling
- Level = floor(XP / 1000) + 1
- Level 1: 0 XP
- Level 10: 9,000 XP
- Level 50: 49,000 XP
- Level 100: 99,000 XP

### Item System
**Tools** - Boost work earnings
- Pickaxe: +10% work rewards (1,000 coins)
- Diamond Drill: +50% work rewards (15,000 coins)

**Weapons** - Defend against robberies
- Wooden Sword: +10% defense (500 coins)
- Mythical Excalibur: +75% defense (50,000 coins)

**Consumables** - Single-use effects
- Energy Drink: Restore 1h work cooldown (200 coins)
- XP Boost Potion: Gain 500 XP instantly (1,000 coins)
- Mega XP Potion: Gain 2,000 XP instantly (3,500 coins)

**Upgrades** - Passive effects
- Bank Account: 20% coins protected from robbery (2,500 coins)
- VIP Pass: Reduce all cooldowns by 25% (50,000 coins)

**Collectibles** - No effects, just for collection
- Bronze Medal, Silver Trophy, Gold Crown, Diamond Ring, Ancient Artifact

## Configuration

Server settings can be adjusted in the `server_settings` table in Supabase:

| Setting | Default | Description |
|---------|---------|-------------|
| `daily_amount` | 500 | Base coins from /daily |
| `daily_cooldown_hours` | 24 | Hours between /daily uses |
| `work_min_amount` | 100 | Minimum /work reward |
| `work_max_amount` | 500 | Maximum /work reward |
| `work_cooldown_hours` | 4 | Hours between /work uses |
| `rob_success_rate` | 0.40 | Robbery success probability (0-1) |
| `rob_cooldown_hours` | 12 | Hours between /rob uses |
| `rob_penalty_percent` | 0.20 | Penalty on failed robbery (0-1) |
| `xp_multiplier` | 1.00 | Global XP multiplier |

## Database Schema

### Tables
- **profiles** - User economy data (coins, XP, level, streaks)
- **items** - Shop items with effects and rarity
- **inventory** - User-owned items with quantities
- **transactions** - Complete transaction history for anti-cheat
- **cooldowns** - Command cooldown tracking
- **server_settings** - Configurable economy parameters

### Security
- Row Level Security (RLS) enabled on all tables
- Users can only view their own data
- Service role key required for bot operations
- All transactions logged with metadata and timestamps

## Project Structure

\`\`\`
astryx-economy-bot/
├── src/
│   ├── index.js              # Main bot entry point
│   ├── database.js           # Database helper functions
│   └── commands/
│       ├── index.js          # Command loader and registry
│       ├── daily.js          # Daily reward command
│       ├── work.js           # Work command
│       ├── pay.js            # Transfer coins command
│       ├── rob.js            # Robbery command
│       ├── shop.js           # Shop browsing & purchase
│       ├── inventory.js      # Inventory management
│       ├── leaderboard.js    # Leaderboard display
│       ├── balance.js        # Balance checker
│       ├── profile.js        # Profile viewer
│       └── help.js           # Help documentation
├── scripts/
│   ├── 001_create_economy_tables.sql
│   ├── 002_profile_trigger.sql
│   └── 003_seed_items.sql
├── .env                      # Environment variables
├── .env.example              # Example environment file
├── package.json              # Node dependencies
└── README.md                 # This file
\`\`\`

## Troubleshooting

**Bot doesn't respond to commands:**
- Ensure bot has proper permissions in your Discord server
- Check that the bot is online (green status) in Discord
- Verify `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` are correct in `.env`
- Wait up to 1 hour for Discord to register global slash commands

**Database errors:**
- Verify Supabase credentials in `.env`
- Check that all three SQL migration scripts ran successfully
- Ensure you're using the `service_role` key, not the `anon` key
- Check Supabase logs in the dashboard

**Commands not showing up:**
- Wait up to 1 hour for Discord to sync global commands
- Try kicking and re-inviting the bot with the OAuth2 URL
- Check console logs for command registration errors
- Verify bot has `applications.commands` scope

**Transaction/balance issues:**
- Check the `transactions` table in Supabase for logs
- Verify RLS policies are enabled on all tables
- Check cooldowns table to see active cooldowns
- Review server_settings for correct configuration values

## Development Tips

- Use `npm run dev` for auto-restart during development
- Check console logs for detailed error messages
- All database operations are logged to console
- Test commands in a private server first
- Monitor the `transactions` table for anti-cheat detection

## Support

For issues or questions:
- Check console logs for error details
- Review Supabase dashboard for database issues
- Verify all environment variables are set correctly
- Check Discord Developer Portal for bot status

## License

MIT License - Feel free to modify and use for your own Discord server!
\`\`\`

```env file="" isHidden
