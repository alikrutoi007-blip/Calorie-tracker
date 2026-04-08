import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

const SNAPSHOT_TABLE = 'app_state_snapshots';

function requireClient() {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY first.');
  }

  return client;
}

export async function getCloudSession() {
  if (!isSupabaseConfigured) return { session: null, user: null };

  const client = requireClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;

  return { session: data.session, user: data.session?.user || null };
}

export function onCloudAuthChange(callback) {
  const client = getSupabaseClient();
  if (!client) return () => {};

  const { data } = client.auth.onAuthStateChange((_event, session) => {
    callback({ session, user: session?.user || null });
  });

  return () => data.subscription.unsubscribe();
}

export async function sendMagicLink(email) {
  const client = requireClient();
  const redirectTo = import.meta.env.VITE_SITE_URL || window.location.origin;

  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });

  if (error) throw error;
}

export async function signOutFromCloud() {
  const client = requireClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function pushCloudSnapshot(userId, payload) {
  const client = requireClient();
  const { data, error } = await client
    .from(SNAPSHOT_TABLE)
    .upsert(
      {
        user_id: userId,
        payload,
        app_version: 'momentum-web-v1',
        platform: 'web',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select('updated_at')
    .single();

  if (error) throw error;
  return data;
}

export async function pullCloudSnapshot(userId) {
  const client = requireClient();
  const { data, error } = await client
    .from(SNAPSHOT_TABLE)
    .select('payload, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
