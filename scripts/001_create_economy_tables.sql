-- Create profiles table for user data
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  coins bigint default 1000 not null,
  xp bigint default 0 not null,
  level int default 1 not null,
  daily_streak int default 0 not null,
  last_daily timestamp with time zone,
  last_work timestamp with time zone,
  rob_attempts int default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Create items table for shop system
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  description text not null,
  price bigint not null,
  category text not null check (category in ('tools', 'weapons', 'collectibles', 'consumables', 'upgrades')),
  rarity text not null check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  effect jsonb,
  created_at timestamp with time zone default now() not null
);

-- Create inventory table for user items
create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  item_id uuid references public.items(id) on delete cascade not null,
  quantity int default 1 not null,
  acquired_at timestamp with time zone default now() not null,
  unique(user_id, item_id)
);

-- Create transactions table for anti-cheat logging
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  type text not null check (type in ('daily', 'work', 'pay', 'rob', 'shop_buy', 'shop_sell', 'use_item', 'admin')),
  amount bigint,
  target_user_id uuid references public.profiles(id) on delete set null,
  item_id uuid references public.items(id) on delete set null,
  metadata jsonb,
  ip_address inet,
  created_at timestamp with time zone default now() not null
);

-- Create server settings table
create table if not exists public.server_settings (
  id uuid primary key default gen_random_uuid(),
  daily_amount bigint default 500 not null,
  daily_cooldown_hours int default 24 not null,
  work_min_amount bigint default 100 not null,
  work_max_amount bigint default 500 not null,
  work_cooldown_hours int default 4 not null,
  rob_success_rate decimal(3,2) default 0.40 not null,
  rob_cooldown_hours int default 12 not null,
  rob_penalty_percent decimal(3,2) default 0.20 not null,
  xp_multiplier decimal(4,2) default 1.00 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Create cooldowns table for rate limiting
create table if not exists public.cooldowns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  command text not null check (command in ('daily', 'work', 'rob')),
  expires_at timestamp with time zone not null,
  unique(user_id, command)
);

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.items enable row level security;
alter table public.inventory enable row level security;
alter table public.transactions enable row level security;
alter table public.server_settings enable row level security;
alter table public.cooldowns enable row level security;

-- RLS Policies for profiles
create policy "profiles_select_all" on public.profiles for select using (true);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- RLS Policies for items (public read)
create policy "items_select_all" on public.items for select using (true);

-- RLS Policies for inventory
create policy "inventory_select_own" on public.inventory for select using (auth.uid() = user_id);
create policy "inventory_insert_own" on public.inventory for insert with check (auth.uid() = user_id);
create policy "inventory_update_own" on public.inventory for update using (auth.uid() = user_id);
create policy "inventory_delete_own" on public.inventory for delete using (auth.uid() = user_id);

-- RLS Policies for transactions (users can view their own)
create policy "transactions_select_own" on public.transactions for select using (auth.uid() = user_id);
create policy "transactions_insert_own" on public.transactions for insert with check (auth.uid() = user_id);

-- RLS Policies for server_settings (public read)
create policy "settings_select_all" on public.server_settings for select using (true);

-- RLS Policies for cooldowns
create policy "cooldowns_select_own" on public.cooldowns for select using (auth.uid() = user_id);
create policy "cooldowns_insert_own" on public.cooldowns for insert with check (auth.uid() = user_id);
create policy "cooldowns_update_own" on public.cooldowns for update using (auth.uid() = user_id);
create policy "cooldowns_delete_own" on public.cooldowns for delete using (auth.uid() = user_id);

-- Create indexes for performance
create index if not exists idx_profiles_coins on public.profiles(coins desc);
create index if not exists idx_profiles_xp on public.profiles(xp desc);
create index if not exists idx_inventory_user on public.inventory(user_id);
create index if not exists idx_transactions_user on public.transactions(user_id);
create index if not exists idx_transactions_created on public.transactions(created_at desc);
create index if not exists idx_cooldowns_user on public.cooldowns(user_id);
create index if not exists idx_cooldowns_expires on public.cooldowns(expires_at);
