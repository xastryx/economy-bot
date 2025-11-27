import { createClient } from "@supabase/supabase-js"

/**
 * Supabase Database Client
 * Handles all database operations for the economy system
 */

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

/**
 * Get or create user profile
 * @param {string} userId - Discord user ID
 * @param {string} username - Discord username
 * @returns {Promise<Object>} User profile data
 */
export async function getProfile(userId, username) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single()

  // If profile doesn't exist, create it
  if (error && error.code === "PGRST116") {
    const { data: newProfile, error: createError } = await supabase
      .from("profiles")
      .insert({
        id: userId,
        username: username,
        coins: 1000,
        xp: 0,
        level: 1,
      })
      .select()
      .single()

    if (createError) throw createError
    return newProfile
  }

  if (error) throw error
  return data
}

/**
 * Update user profile
 * @param {string} userId - Discord user ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated profile
 */
export async function updateProfile(userId, updates) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Log a transaction for anti-cheat monitoring
 * @param {Object} transaction - Transaction details
 * @returns {Promise<void>}
 */
export async function logTransaction(transaction) {
  const { error } = await supabase.from("transactions").insert({
    user_id: transaction.userId,
    type: transaction.type,
    amount: transaction.amount || null,
    target_user_id: transaction.targetUserId || null,
    item_id: transaction.itemId || null,
    metadata: transaction.metadata || null,
    created_at: new Date().toISOString(),
  })

  if (error) console.error("Failed to log transaction:", error)
}

/**
 * Check and manage cooldowns
 * @param {string} userId - Discord user ID
 * @param {string} command - Command name (daily, work, rob)
 * @returns {Promise<Object>} Cooldown info { onCooldown: boolean, expiresAt: Date|null }
 */
export async function checkCooldown(userId, command) {
  const { data } = await supabase
    .from("cooldowns")
    .select("expires_at")
    .eq("user_id", userId)
    .eq("command", command)
    .single()

  if (!data) return { onCooldown: false, expiresAt: null }

  const expiresAt = new Date(data.expires_at)
  const now = new Date()

  if (expiresAt > now) {
    return { onCooldown: true, expiresAt }
  }

  // Cooldown expired, remove it
  await supabase.from("cooldowns").delete().eq("user_id", userId).eq("command", command)

  return { onCooldown: false, expiresAt: null }
}

/**
 * Set a cooldown for a command
 * @param {string} userId - Discord user ID
 * @param {string} command - Command name
 * @param {number} hours - Cooldown duration in hours
 * @returns {Promise<void>}
 */
export async function setCooldown(userId, command, hours) {
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + hours)

  await supabase.from("cooldowns").upsert({
    user_id: userId,
    command,
    expires_at: expiresAt.toISOString(),
  })
}

/**
 * Get server settings
 * @returns {Promise<Object>} Server configuration
 */
export async function getServerSettings() {
  const { data, error } = await supabase.from("server_settings").select("*").single()

  if (error) throw error
  return data
}

/**
 * Get all shop items
 * @param {string} category - Optional category filter
 * @returns {Promise<Array>} List of items
 */
export async function getItems(category = null) {
  let query = supabase.from("items").select("*").order("price", { ascending: true })

  if (category) {
    query = query.eq("category", category)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

/**
 * Get user's inventory
 * @param {string} userId - Discord user ID
 * @returns {Promise<Array>} User's items with details
 */
export async function getInventory(userId) {
  const { data, error } = await supabase
    .from("inventory")
    .select(`
      *,
      items (*)
    `)
    .eq("user_id", userId)

  if (error) throw error
  return data
}

/**
 * Add item to user's inventory
 * @param {string} userId - Discord user ID
 * @param {string} itemId - Item ID
 * @param {number} quantity - Quantity to add
 * @returns {Promise<void>}
 */
export async function addToInventory(userId, itemId, quantity = 1) {
  // Check if user already has this item
  const { data: existing } = await supabase
    .from("inventory")
    .select("*")
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .single()

  if (existing) {
    // Update quantity
    await supabase
      .from("inventory")
      .update({ quantity: existing.quantity + quantity })
      .eq("user_id", userId)
      .eq("item_id", itemId)
  } else {
    // Insert new item
    await supabase.from("inventory").insert({ user_id: userId, item_id: itemId, quantity })
  }
}

/**
 * Remove item from user's inventory
 * @param {string} userId - Discord user ID
 * @param {string} itemId - Item ID
 * @param {number} quantity - Quantity to remove
 * @returns {Promise<void>}
 */
export async function removeFromInventory(userId, itemId, quantity = 1) {
  const { data: existing } = await supabase
    .from("inventory")
    .select("*")
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .single()

  if (!existing) throw new Error("Item not found in inventory")

  if (existing.quantity <= quantity) {
    // Remove item completely
    await supabase.from("inventory").delete().eq("user_id", userId).eq("item_id", itemId)
  } else {
    // Decrease quantity
    await supabase
      .from("inventory")
      .update({ quantity: existing.quantity - quantity })
      .eq("user_id", userId)
      .eq("item_id", itemId)
  }
}

/**
 * Get leaderboard data
 * @param {string} type - 'coins' or 'xp'
 * @param {number} limit - Number of users to fetch
 * @returns {Promise<Array>} Top users
 */
export async function getLeaderboard(type = "coins", limit = 10) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, coins, xp, level")
    .order(type, { ascending: false })
    .limit(limit)

  if (error) throw error
  return data
}

export { supabase }
