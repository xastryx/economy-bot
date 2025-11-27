-- Insert default server settings
insert into public.server_settings (id, daily_amount, work_min_amount, work_max_amount)
values (gen_random_uuid(), 500, 100, 500)
on conflict do nothing;

-- Seed shop items
insert into public.items (name, description, price, category, rarity, effect) values
-- Tools
('Fishing Rod', 'Increases work income by 10%', 2500, 'tools', 'common', '{"type": "work_boost", "value": 0.10}'),
('Lucky Coin', 'Increases daily reward by 15%', 5000, 'tools', 'uncommon', '{"type": "daily_boost", "value": 0.15}'),
('Mining Pickaxe', 'Increases work income by 25%', 12000, 'tools', 'rare', '{"type": "work_boost", "value": 0.25}'),
('Golden Shovel', 'Increases work income by 50%', 50000, 'tools', 'epic', '{"type": "work_boost", "value": 0.50}'),
('Divine Hammer', 'Doubles work income', 250000, 'tools', 'legendary', '{"type": "work_boost", "value": 1.00}'),

-- Weapons (for rob success)
('Wooden Stick', 'Increases rob success by 5%', 1500, 'weapons', 'common', '{"type": "rob_boost", "value": 0.05}'),
('Steel Dagger', 'Increases rob success by 12%', 7500, 'weapons', 'uncommon', '{"type": "rob_boost", "value": 0.12}'),
('Enchanted Sword', 'Increases rob success by 20%', 25000, 'weapons', 'rare', '{"type": "rob_boost", "value": 0.20}'),
('Dragon Blade', 'Increases rob success by 35%', 100000, 'weapons', 'epic', '{"type": "rob_boost", "value": 0.35}'),
('Infinity Gauntlet', 'Guarantees rob success', 500000, 'weapons', 'legendary', '{"type": "rob_boost", "value": 1.00}'),

-- Collectibles
('Bronze Trophy', 'A shiny bronze trophy', 5000, 'collectibles', 'common', null),
('Silver Trophy', 'A gleaming silver trophy', 15000, 'collectibles', 'uncommon', null),
('Gold Trophy', 'A prestigious gold trophy', 50000, 'collectibles', 'rare', null),
('Platinum Trophy', 'An exclusive platinum trophy', 150000, 'collectibles', 'epic', null),
('Diamond Trophy', 'The ultimate achievement', 1000000, 'collectibles', 'legendary', null),

-- Consumables
('Energy Drink', 'Instantly reset work cooldown', 3000, 'consumables', 'common', '{"type": "cooldown_reset", "command": "work"}'),
('Time Crystal', 'Reset all cooldowns', 15000, 'consumables', 'rare', '{"type": "cooldown_reset", "command": "all"}'),
('Coin Pouch', 'Gain 5000 coins instantly', 4000, 'consumables', 'uncommon', '{"type": "instant_coins", "value": 5000}'),
('Treasure Chest', 'Gain 25000 coins instantly', 18000, 'consumables', 'rare', '{"type": "instant_coins", "value": 25000}'),

-- Upgrades
('Bank Account', 'Protects 50% of coins from rob', 20000, 'upgrades', 'rare', '{"type": "rob_protection", "value": 0.50}'),
('Vault', 'Protects 80% of coins from rob', 100000, 'upgrades', 'epic', '{"type": "rob_protection", "value": 0.80}'),
('XP Booster', 'Gain 50% more XP from all actions', 30000, 'upgrades', 'epic', '{"type": "xp_boost", "value": 0.50}'),
('Streak Shield', 'Protect daily streak for 7 days', 25000, 'upgrades', 'rare', '{"type": "streak_protection", "days": 7}')
on conflict (name) do nothing;
