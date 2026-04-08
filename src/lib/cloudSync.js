import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

const SNAPSHOT_TABLE = 'app_state_snapshots';
const PROFILE_TABLE = 'profiles';
const MEAL_CAPTURE_TABLE = 'meal_captures';
const MEAL_CAPTURE_BUCKET = 'meal-captures';

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

export async function signUpWithPassword({ email, password, displayName }) {
  const client = requireClient();

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName || '',
      },
    },
  });

  if (error) throw error;
  return data;
}

export async function signInWithPassword({ email, password }) {
  const client = requireClient();

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
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

export async function updateCloudPassword(password) {
  const client = requireClient();
  const { data, error } = await client.auth.updateUser({ password });
  if (error) throw error;
  return data;
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

export async function fetchCloudProfile(userId) {
  const client = requireClient();
  const { data, error } = await client
    .from(PROFILE_TABLE)
    .select('id, email, display_name, updated_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateCloudProfile(userId, updates) {
  const client = requireClient();
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
    .single();

  if (error) throw error;
  return data;
}

function sanitizeFilename(filename) {
  return filename.toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-');
}

export async function uploadMealPhoto(userId, file) {
  const client = requireClient();
  const extension = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
  const path = `${userId}/${Date.now()}-${sanitizeFilename(file.name || `meal.${extension}`)}`;

  const { data, error } = await client.storage
    .from(MEAL_CAPTURE_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) throw error;
  return data.path;
}

export async function createMealPhotoSignedUrl(path, expiresIn = 3600) {
  const client = requireClient();
  const { data, error } = await client.storage
    .from(MEAL_CAPTURE_BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error) throw error;
  return data.signedUrl;
}

export async function fetchMealCaptures(userId, options = {}) {
  const client = requireClient();
  const limit = options.limit || 20;

  const { data, error } = await client
    .from(MEAL_CAPTURE_TABLE)
    .select('id, source, summary, transcript, image_name, storage_path, provider, total_calories, foods, date_key, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return Promise.all(
    (data || []).map(async (meal) => {
      if (!meal.storage_path) return { ...meal, imageUrl: '' };

      try {
        const imageUrl = await createMealPhotoSignedUrl(meal.storage_path);
        return { ...meal, imageUrl };
      } catch {
        return { ...meal, imageUrl: '' };
      }
    }),
  );
}
