import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { createClient } from '@supabase/supabase-js'

let mobileSupabase = null

function getConfigValue(key, extraKey) {
  return globalThis?.process?.env?.[key] || Constants.expoConfig?.extra?.[extraKey] || ''
}

export function getMobileSupabaseUrl() {
  return getConfigValue('EXPO_PUBLIC_SUPABASE_URL', 'supabaseUrl')
}

export function getMobileSupabaseKey() {
  return getConfigValue('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'supabasePublishableKey')
}

export function isMobileSupabaseConfigured() {
  return Boolean(getMobileSupabaseUrl() && getMobileSupabaseKey())
}

export function getMobileSupabaseClient() {
  const url = getMobileSupabaseUrl()
  const key = getMobileSupabaseKey()

  if (!url || !key) return null

  if (!mobileSupabase) {
    mobileSupabase = createClient(url, key, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  }

  return mobileSupabase
}

export async function getMobileSession() {
  const client = getMobileSupabaseClient()
  if (!client) return { session: null, user: null }

  const { data, error } = await client.auth.getSession()
  if (error) throw error

  return {
    session: data.session,
    user: data.session?.user || null,
  }
}

export async function getMobileAccessToken() {
  const { session } = await getMobileSession()
  return session?.access_token || ''
}

export function onMobileAuthStateChange(callback) {
  const client = getMobileSupabaseClient()
  if (!client) return () => {}

  const { data } = client.auth.onAuthStateChange((event, session) => {
    callback({
      event,
      session,
      user: session?.user || null,
    })
  })

  return () => data.subscription.unsubscribe()
}

export async function getMobileCloudPreview() {
  const client = getMobileSupabaseClient()
  const { session } = await getMobileSession()

  return {
    configured: Boolean(client),
    auth: Boolean(client),
    sync: Boolean(client),
    signedIn: Boolean(session?.user),
  }
}
