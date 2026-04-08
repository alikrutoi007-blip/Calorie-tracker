import Constants from 'expo-constants'
import { createClient } from '@supabase/supabase-js'

let mobileSupabase = null

export function getMobileSupabaseClient() {
  const url = Constants.expoConfig?.extra?.supabaseUrl || ''
  const key = Constants.expoConfig?.extra?.supabasePublishableKey || ''

  if (!url || !key) return null

  if (!mobileSupabase) {
    mobileSupabase = createClient(url, key)
  }

  return mobileSupabase
}

export async function getMobileCloudPreview() {
  const client = getMobileSupabaseClient()

  return {
    configured: Boolean(client),
    auth: Boolean(client),
    sync: Boolean(client),
  }
}
