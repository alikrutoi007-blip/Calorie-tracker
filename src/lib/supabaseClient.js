import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const mealFunctionName = import.meta.env.VITE_SUPABASE_MEAL_FUNCTION || 'analyze-meal';

let clientInstance = null;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);
export const configuredMealFunctionName = mealFunctionName;

export function getSupabaseClient() {
  if (!isSupabaseConfigured) return null;

  if (!clientInstance) {
    clientInstance = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return clientInstance;
}
