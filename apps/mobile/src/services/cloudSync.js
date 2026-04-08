import { getMobileSupabaseClient, isMobileSupabaseConfigured } from './supabase'

const SNAPSHOT_TABLE = 'app_state_snapshots'
const PROFILE_TABLE = 'profiles'
const MEAL_CAPTURE_TABLE = 'meal_captures'
const MEAL_CAPTURE_BUCKET = 'meal-captures'

function requireClient() {
  const client = getMobileSupabaseClient()
  if (!client) {
    throw new Error('Supabase is not configured in Expo yet. Fill EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY first.')
  }

  return client
}

export async function getCloudSession() {
  if (!isMobileSupabaseConfigured()) return { session: null, user: null }

  const client = requireClient()
  const { data, error } = await client.auth.getSession()
  if (error) throw error

  return { session: data.session, user: data.session?.user || null }
}

export function onCloudAuthChange(callback) {
  const client = getMobileSupabaseClient()
  if (!client) return () => {}

  const { data } = client.auth.onAuthStateChange((event, session) => {
    callback({ event, session, user: session?.user || null })
  })

  return () => data.subscription.unsubscribe()
}

export async function signUpWithPassword({ email, password, displayName }) {
  const client = requireClient()

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName || '',
      },
    },
  })

  if (error) throw error
  return data
}

export async function signInWithPassword({ email, password }) {
  const client = requireClient()

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw error
  return data
}

export async function signOutFromCloud() {
  const client = requireClient()
  const { error } = await client.auth.signOut()
  if (error) throw error
}

export async function fetchCloudProfile(userId) {
  const client = requireClient()
  const { data, error } = await client
    .from(PROFILE_TABLE)
    .select('id, email, display_name, updated_at')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function updateCloudProfile(userId, updates) {
  const client = requireClient()
  const { data, error } = await client
    .from(PROFILE_TABLE)
    .upsert(
      {
        id: userId,
        ...updates,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    .select('id, email, display_name, updated_at')
    .single()

  if (error) throw error
  return data
}

export async function pushCloudSnapshot(userId, payload) {
  const client = requireClient()
  const { data, error } = await client
    .from(SNAPSHOT_TABLE)
    .upsert(
      {
        user_id: userId,
        payload,
        app_version: 'momentum-mobile-v1',
        platform: 'expo-native',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select('updated_at')
    .single()

  if (error) throw error
  return data
}

export async function pullCloudSnapshot(userId) {
  const client = requireClient()
  const { data, error } = await client
    .from(SNAPSHOT_TABLE)
    .select('payload, updated_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function createMealPhotoSignedUrl(path, expiresIn = 3600) {
  const client = requireClient()
  const { data, error } = await client.storage
    .from(MEAL_CAPTURE_BUCKET)
    .createSignedUrl(path, expiresIn)

  if (error) throw error
  return data.signedUrl
}

export async function fetchMealCaptures(userId, options = {}) {
  const client = requireClient()
  const limit = options.limit || 20

  const { data, error } = await client
    .from(MEAL_CAPTURE_TABLE)
    .select('id, source, summary, transcript, image_name, storage_path, provider, total_calories, foods, raw_payload, date_key, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  return Promise.all(
    (data || []).map(async (meal) => {
      const totalMacros = meal.raw_payload?.analysis?.totalMacros || {
        protein: (meal.foods || []).reduce((total, food) => total + (Number(food?.protein) || 0), 0),
        fat: (meal.foods || []).reduce((total, food) => total + (Number(food?.fat) || 0), 0),
        carbs: (meal.foods || []).reduce((total, food) => total + (Number(food?.carbs) || 0), 0),
      }

      if (!meal.storage_path) return { ...meal, imageUrl: '', total_macros: totalMacros }

      try {
        const imageUrl = await createMealPhotoSignedUrl(meal.storage_path)
        return { ...meal, imageUrl, total_macros: totalMacros }
      } catch {
        return { ...meal, imageUrl: '', total_macros: totalMacros }
      }
    }),
  )
}
