import { configuredMealFunctionName, getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

export async function analyzeMealCapture(payload) {
  if (!isSupabaseConfigured) {
    return {
      status: 'setup_required',
      message: 'Connect Supabase and deploy the analyze-meal edge function to enable AI calorie recognition.',
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      status: 'setup_required',
      message: 'Supabase client is not available on this device yet.',
    };
  }

  const { data, error } = await client.functions.invoke(configuredMealFunctionName, {
    body: payload,
  });

  if (error) {
    throw new Error(error.message || 'Meal analysis request failed.');
  }

  return data;
}
