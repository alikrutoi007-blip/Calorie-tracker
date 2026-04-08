import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import './App.css';
import { clearAppState, loadAppState, saveAppState } from './lib/appDb';
import {
  fetchCloudProfile,
  fetchMealCaptures,
  getCloudSession,
  onCloudAuthChange,
  pullCloudSnapshot,
  pushCloudSnapshot,
  requestPasswordReset,
  resendSignupConfirmation,
  sendPasswordReauth,
  signInWithPassword,
  signUpWithPassword,
  signOutFromCloud,
  updateCloudPassword,
  updateCloudProfile,
  uploadMealPhoto,
} from './lib/cloudSync';
import { analyzeMealCapture } from './lib/mealAnalysis';
import { isSupabaseConfigured } from './lib/supabaseClient';

const STORAGE_KEY = 'momentum-ios-v3';
const LEGACY_STORAGE_KEY = 'nutriapp-command-center-v2';
const RHYTHM_DAYS = 7;
const DEFAULT_CALORIE_TARGET = 2200;
const DEFAULT_SLEEP_TARGET = 8;
const TAB_ITEMS = [
  { id: 'habits', label: 'Habit tracker', icon: 'check_circle' },
  { id: 'calories', label: 'Calorie tracking', icon: 'restaurant' },
  { id: 'insights', label: 'Insights', icon: 'insights' },
];

const COLOR_SWATCHES = ['#f97316', '#8b5cf6', '#14b8a6', '#ec4899', '#0ea5e9'];
const JOURNAL_PROMPTS = [
  'What felt easy today?',
  'Where did resistance show up?',
  'What one move would make tomorrow lighter?',
  'What small win deserves a note?',
];

const PRESET_HABITS = [
  { id: 'water', name: 'Water first', cue: 'Start the day hydrated', icon: '💧', color: '#0ea5e9' },
  { id: 'walk', name: 'Daily walk', cue: '20 minutes outside', icon: '🚶', color: '#14b8a6' },
  { id: 'workout', name: 'Workout', cue: 'Strength or movement', icon: '🏋️', color: '#f97316' },
  { id: 'sleep', name: 'Sleep before midnight', cue: 'Protect recovery', icon: '🌙', color: '#8b5cf6' },
  { id: 'meal', name: 'Mindful meal', cue: 'No screen while eating', icon: '🍽️', color: '#ec4899' },
];

const CALORIE_CAPTURE_MODES = [
  {
    id: 'photo',
    title: 'Snap meal',
    body: 'Take one clean top or angle shot, then confirm detected foods.',
    icon: 'photo_camera',
  },
  {
    id: 'voice',
    title: 'Speak meal',
    body: 'Say the meal in one sentence so we can parse food + serving size.',
    icon: 'mic',
  },
  {
    id: 'manual',
    title: 'Type meal',
    body: 'Write the meal naturally if you cannot shoot or speak right now.',
    icon: 'keyboard',
  },
];

const APP_SETTINGS = [
  {
    section: 'app',
    key: 'habitCelebrations',
    label: 'Habit celebrations',
    description: 'Keep sparks and little completion rewards visible.',
  },
  {
    section: 'app',
    key: 'reduceMotion',
    label: 'Reduce motion',
    description: 'Tone down animation for a calmer iPhone feel.',
  },
  {
    section: 'app',
    key: 'dailyNudges',
    label: 'Daily nudges',
    description: 'Keep the interface gently encouraging instead of silent.',
  },
  {
    section: 'app',
    key: 'installPrompts',
    label: 'Install prompts',
    description: 'Remind the user to add Momentum to the Home Screen when it helps.',
  },
];

const EMAIL_SETTINGS = [
  {
    section: 'email',
    key: 'securityAlerts',
    label: 'Security alerts',
    description: 'Keep password and recovery activity emails enabled.',
  },
  {
    section: 'email',
    key: 'weeklyDigest',
    label: 'Weekly digest',
    description: 'Receive a soft weekly recap of streaks and rhythm.',
  },
  {
    section: 'email',
    key: 'productUpdates',
    label: 'Product updates',
    description: 'Hear about new features only when they are ready.',
  },
];

const SETTINGS_SECTIONS = [
  {
    id: 'notifications',
    label: 'Уведомления',
    title: 'Push, mail, nudges',
    description: 'Напоминания, письма и мягкие возвраты в приложение.',
    icon: 'notifications_active',
  },
  {
    id: 'account',
    label: 'Настройки аккаунта',
    title: 'Identity and backup',
    description: 'Вход, пароль, синхронизация, профиль и восстановление.',
    icon: 'manage_accounts',
  },
  {
    id: 'app',
    label: 'Настройки приложения',
    title: 'Interface feel',
    description: 'Анимации, поведение интерфейса и локальные предпочтения.',
    icon: 'tune',
  },
  {
    id: 'about',
    label: 'About us',
    title: 'Why Momentum exists',
    description: 'Идея продукта, ценности и направление развития.',
    icon: 'favorite',
  },
  {
    id: 'subscriptions',
    label: 'Подписки',
    title: 'Pro layer',
    description: 'Что будет в premium-слое и зачем он нужен.',
    icon: 'workspace_premium',
  },
];

const SUBSCRIPTION_PLANS = [
  {
    id: 'free',
    label: 'Free',
    price: '$0',
    note: 'Core habits, calories and journal',
  },
  {
    id: 'pro',
    label: 'Momentum Pro',
    price: '$7.99/mo',
    note: 'Deeper AI nutrition, smarter reminders and native iPhone layer',
  },
];

const PREMIUM_FEATURES = [
  'Advanced Smart Chef suggestions',
  'AI-powered reminder tone and timing',
  'Health sync and native iPhone integrations',
  'Deeper meal editing and saved food intelligence',
];

const NATIVE_LANE_FEATURES = [
  'Add to Home Screen / PWA install',
  'Camera capture optimized for iPhone',
  'Microphone capture with native-ready path',
  'HealthKit and push layer reserved for Expo build',
];

const RETURN_PROMPTS = {
  morning: 'Open the day with one tiny action: water, plan, or breakfast check-in.',
  evening: 'Close the loop softly: log dinner, save one note, then stop for today.',
};

const ACHIEVEMENT_LIBRARY = [
  {
    id: 'first-scan',
    icon: 'photo_camera',
    title: 'First scan',
    body: 'Logged a meal with camera or voice for the first time.',
  },
  {
    id: 'protein-closer',
    icon: 'fitness_center',
    title: 'Protein closer',
    body: 'Closed the day with a strong protein finish.',
  },
  {
    id: 'sugar-smoother',
    icon: 'water_drop',
    title: 'Sugar smoother',
    body: 'Balanced a high-glycemic meal with fiber or protein.',
  },
  {
    id: 'macro-balance',
    icon: 'donut_small',
    title: 'Macro balance',
    body: 'Kept calories and macros in a stable daily rhythm.',
  },
  {
    id: 'smart-chef',
    icon: 'skillet',
    title: 'Smart chef',
    body: 'Used a fridge-based suggestion instead of random snacking.',
  },
  {
    id: 'streak-fuel',
    icon: 'local_fire_department',
    title: 'Streak fuel',
    body: 'Fed the day without breaking the habit loop.',
  },
];

const PARTICLES = Array.from({ length: 10 }, (_, index) => index);

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatDateKey(date) {
  const target = new Date(date);
  target.setHours(12, 0, 0, 0);
  return target.toISOString().slice(0, 10);
}

function formatShortDate(date, options) {
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatAuthMessage(message) {
  if (!message) return 'Something went wrong with your account request.';

  const lowered = message.toLowerCase();
  if (lowered.includes('invalid login credentials')) return 'Email or password is incorrect.';
  if (lowered.includes('email not confirmed')) return 'Confirm your email once in Supabase, then sign in.';
  if (lowered.includes('nonce') || lowered.includes('reauthentication')) return 'Supabase needs an email verification code before the password can change.';
  if (lowered.includes('user already registered')) return 'This email already has an account. Try Sign in.';
  if (lowered.includes('password should be at least')) return 'Password is too short. Use at least 6 characters.';
  if (lowered.includes('same password')) return 'Choose a new password, not the current one.';
  return message;
}

function formatMealAnalysisMessage(message) {
  if (!message) return 'Meal analysis could not finish on this device yet.';

  const lowered = message.toLowerCase();
  if (lowered.includes('openai_api_key')) return 'AI meal analysis is not configured yet. Add the OpenAI key to Supabase secrets.';
  if (lowered.includes('supabase environment variables')) return 'Supabase edge function setup is incomplete right now.';
  if (lowered.includes('openai meal parse failed')) return 'AI could not confidently parse this meal. Try a clearer photo or a shorter description.';
  if (lowered.includes('failed to fetch') || lowered.includes('network')) return 'The network interrupted the meal analysis request. Try again in a moment.';
  if (lowered.includes('storage') || lowered.includes('bucket')) return 'The meal was analyzed, but photo storage is not ready yet.';
  if (lowered.includes('row-level security') || lowered.includes('policy')) return 'Your account is signed in, but the backend blocked saving this meal. Supabase policies need a quick check.';
  return message;
}

function isRecoveryRedirect() {
  if (typeof window === 'undefined') return false;

  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : '');
  return url.searchParams.get('type') === 'recovery' || hashParams.get('type') === 'recovery';
}

function clearAuthRedirectUrl() {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : '');
  let didChange = false;

  ['access_token', 'refresh_token', 'expires_at', 'expires_in', 'token_type', 'type', 'code'].forEach((key) => {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      didChange = true;
    }

    if (hashParams.has(key)) {
      hashParams.delete(key);
      didChange = true;
    }
  });

  const nextHash = hashParams.toString();
  if (url.hash !== (nextHash ? `#${nextHash}` : '')) {
    url.hash = nextHash ? `#${nextHash}` : '';
    didChange = true;
  }

  if (didChange) {
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }
}

function needsPasswordReauth(message) {
  if (!message) return false;
  const lowered = message.toLowerCase();
  return lowered.includes('nonce') || lowered.includes('reauthentication') || lowered.includes('secure password change');
}

function getRecentDays(count) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  return Array.from({ length: count }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (count - index - 1));

    return {
      key: formatDateKey(day),
      weekday: formatShortDate(day, { weekday: 'short' }).replace('.', '').toUpperCase(),
      label: formatShortDate(day, { day: 'numeric', month: 'short' }),
      dayNumber: day.getDate(),
      isToday: index === count - 1,
      iso: day,
    };
  });
}

function hexToRgba(hex, alpha) {
  const raw = hex.replace('#', '');
  const normalized = raw.length === 3 ? raw.split('').map((part) => `${part}${part}`).join('') : raw;
  const colorInt = Number.parseInt(normalized, 16);
  const red = (colorInt >> 16) & 255;
  const green = (colorInt >> 8) & 255;
  const blue = colorInt & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function createDefaultPreferences() {
  return {
    app: {
      habitCelebrations: true,
      reduceMotion: false,
      dailyNudges: true,
      installPrompts: true,
    },
    email: {
      securityAlerts: true,
      weeklyDigest: true,
      productUpdates: false,
    },
    notifications: {
      pushReminders: false,
      morningCheckIn: true,
      eveningCheckIn: true,
    },
  };
}

function createDefaultState() {
  return {
    profile: { name: '', intention: '', onboardingComplete: false },
    preferences: createDefaultPreferences(),
    achievements: {},
    habits: [],
    calories: { target: DEFAULT_CALORIE_TARGET, proteinTarget: 140, entries: {}, macros: {} },
    sleep: { target: DEFAULT_SLEEP_TARGET, entries: {} },
    retention: { morningHour: 9, eveningHour: 20, checkins: {} },
    foodLibrary: { favorites: [] },
    subscription: { plan: 'free', billing: 'monthly', startedAt: null },
    journal: [],
  };
}

function normalizeMacroEntry(entry) {
  return {
    protein: clamp(Number(entry?.protein) || 0, 0, 1000),
    fat: clamp(Number(entry?.fat) || 0, 0, 1000),
    carbs: clamp(Number(entry?.carbs) || 0, 0, 1000),
  };
}

function normalizePreferences(preferences) {
  const fallback = createDefaultPreferences();

  return {
    app: {
      habitCelebrations: typeof preferences?.app?.habitCelebrations === 'boolean'
        ? preferences.app.habitCelebrations
        : fallback.app.habitCelebrations,
      reduceMotion: typeof preferences?.app?.reduceMotion === 'boolean'
        ? preferences.app.reduceMotion
        : fallback.app.reduceMotion,
      dailyNudges: typeof preferences?.app?.dailyNudges === 'boolean'
        ? preferences.app.dailyNudges
        : fallback.app.dailyNudges,
      installPrompts: typeof preferences?.app?.installPrompts === 'boolean'
        ? preferences.app.installPrompts
        : fallback.app.installPrompts,
    },
    email: {
      securityAlerts: typeof preferences?.email?.securityAlerts === 'boolean'
        ? preferences.email.securityAlerts
        : fallback.email.securityAlerts,
      weeklyDigest: typeof preferences?.email?.weeklyDigest === 'boolean'
        ? preferences.email.weeklyDigest
        : fallback.email.weeklyDigest,
      productUpdates: typeof preferences?.email?.productUpdates === 'boolean'
        ? preferences.email.productUpdates
        : fallback.email.productUpdates,
    },
    notifications: {
      pushReminders: typeof preferences?.notifications?.pushReminders === 'boolean'
        ? preferences.notifications.pushReminders
        : fallback.notifications.pushReminders,
      morningCheckIn: typeof preferences?.notifications?.morningCheckIn === 'boolean'
        ? preferences.notifications.morningCheckIn
        : fallback.notifications.morningCheckIn,
      eveningCheckIn: typeof preferences?.notifications?.eveningCheckIn === 'boolean'
        ? preferences.notifications.eveningCheckIn
        : fallback.notifications.eveningCheckIn,
    },
  };
}

function createHabitDraft(index = 0) {
  return {
    id: null,
    name: '',
    cue: '',
    icon: '✨',
    color: COLOR_SWATCHES[index % COLOR_SWATCHES.length],
  };
}

function normalizeHabit(habit, index) {
  return {
    id: habit?.id || uid(),
    name: habit?.name || `Habit ${index + 1}`,
    cue: habit?.cue || habit?.description || 'Tiny daily win',
    icon: habit?.icon || '✨',
    color: habit?.color || COLOR_SWATCHES[index % COLOR_SWATCHES.length],
    history: habit?.history && typeof habit.history === 'object' ? habit.history : {},
  };
}

function normalizeJournalEntry(entry) {
  return {
    id: entry?.id || uid(),
    dateKey: entry?.dateKey || formatDateKey(entry?.createdAt || new Date()),
    text: entry?.text || '',
    createdAt: entry?.createdAt || new Date().toISOString(),
    updatedAt: entry?.updatedAt || null,
  };
}

function normalizeFavoriteMeal(meal) {
  if (!meal || typeof meal !== 'object') return null;

  return {
    id: meal.id || uid(),
    summary: meal.summary || meal.title || 'Saved meal',
    source: meal.source || 'favorite',
    foods: Array.isArray(meal.foods)
      ? meal.foods.map((food) => ({
          name: food?.name || 'meal item',
          quantityText: food?.quantityText || '1 serving',
          calories: Number(food?.calories) || 0,
          protein: Number(food?.protein) || 0,
          fat: Number(food?.fat) || 0,
          carbs: Number(food?.carbs) || 0,
        }))
      : [],
    totalCalories: Number(meal.totalCalories) || 0,
    totalMacros: normalizeMacroEntry(meal.totalMacros),
    createdAt: meal.createdAt || new Date().toISOString(),
    lastUsedAt: meal.lastUsedAt || null,
    note: meal.note || '',
  };
}

function sumFoods(foods) {
  const normalizedFoods = Array.isArray(foods) ? foods : [];
  const totalCalories = normalizedFoods.reduce((total, food) => total + (Number(food?.calories) || 0), 0);
  const totalMacros = normalizedFoods.reduce(
    (totals, food) => ({
      protein: totals.protein + (Number(food?.protein) || 0),
      fat: totals.fat + (Number(food?.fat) || 0),
      carbs: totals.carbs + (Number(food?.carbs) || 0),
    }),
    { protein: 0, fat: 0, carbs: 0 },
  );

  return {
    totalCalories: clamp(Math.round(totalCalories), 0, 10000),
    totalMacros: normalizeMacroEntry(totalMacros),
  };
}

function normalizeCheckins(checkins) {
  if (!checkins || typeof checkins !== 'object') return {};

  return Object.fromEntries(
    Object.entries(checkins).map(([dateKey, value]) => [
      dateKey,
      {
        morning: Boolean(value?.morning),
        evening: Boolean(value?.evening),
      },
    ]),
  );
}

function normalizeState(parsed) {
  const fallback = createDefaultState();
  const todayKey = formatDateKey(new Date());

  if (!parsed || typeof parsed !== 'object') return fallback;

  const calorieEntries = parsed?.calories?.entries && typeof parsed.calories.entries === 'object'
    ? parsed.calories.entries
    : {};
  const macroEntries = parsed?.calories?.macros && typeof parsed.calories.macros === 'object'
    ? Object.fromEntries(
        Object.entries(parsed.calories.macros).map(([key, value]) => [key, normalizeMacroEntry(value)]),
      )
    : {};
  const favorites = Array.isArray(parsed?.foodLibrary?.favorites)
    ? parsed.foodLibrary.favorites.map(normalizeFavoriteMeal).filter(Boolean)
    : [];
  const retentionCheckins = normalizeCheckins(parsed?.retention?.checkins);

  if (!Object.keys(calorieEntries).length && Number.isFinite(Number(parsed?.calories?.consumed))) {
    calorieEntries[todayKey] = Number(parsed.calories.consumed);
  }

  const habits = Array.isArray(parsed?.habits) ? parsed.habits.map(normalizeHabit) : [];
  const journal = Array.isArray(parsed?.journal) ? parsed.journal.map(normalizeJournalEntry) : [];
  const hasData = habits.length || journal.length || Object.keys(calorieEntries).length || Object.keys(parsed?.sleep?.entries || {}).length;

  return {
    profile: {
      name: parsed?.profile?.name || '',
      intention: parsed?.profile?.intention || '',
      onboardingComplete: typeof parsed?.profile?.onboardingComplete === 'boolean'
        ? parsed.profile.onboardingComplete
        : Boolean(hasData),
    },
    preferences: normalizePreferences(parsed?.preferences),
    achievements: parsed?.achievements && typeof parsed.achievements === 'object' ? parsed.achievements : {},
    habits,
    calories: {
      target: Number(parsed?.calories?.target) || DEFAULT_CALORIE_TARGET,
      proteinTarget: Number(parsed?.calories?.proteinTarget) || 140,
      entries: calorieEntries,
      macros: macroEntries,
    },
    sleep: {
      target: Number(parsed?.sleep?.target) || DEFAULT_SLEEP_TARGET,
      entries: parsed?.sleep?.entries && typeof parsed.sleep.entries === 'object' ? parsed.sleep.entries : {},
    },
    retention: {
      morningHour: clamp(Number(parsed?.retention?.morningHour) || 9, 5, 12),
      eveningHour: clamp(Number(parsed?.retention?.eveningHour) || 20, 16, 23),
      checkins: retentionCheckins,
    },
    foodLibrary: {
      favorites,
    },
    subscription: {
      plan: parsed?.subscription?.plan === 'pro' ? 'pro' : 'free',
      billing: parsed?.subscription?.billing === 'yearly' ? 'yearly' : 'monthly',
      startedAt: parsed?.subscription?.startedAt || null,
    },
    journal,
  };
}

function loadState() {
  const fallback = createDefaultState();

  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) || window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return fallback;

    return normalizeState(JSON.parse(raw));
  } catch (error) {
    console.error('Unable to load app state', error);
    return fallback;
  }
}

function countHabitsForDay(habits, dateKey) {
  return habits.reduce((total, habit) => total + (habit.history?.[dateKey] ? 1 : 0), 0);
}

function computeStreak(history) {
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  let streak = 0;

  if (!history?.[formatDateKey(cursor)]) cursor.setDate(cursor.getDate() - 1);

  while (history?.[formatDateKey(cursor)]) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function computeAverage(values) {
  const filtered = values.filter((value) => Number.isFinite(value) && value > 0);
  if (!filtered.length) return 0;
  return filtered.reduce((total, value) => total + value, 0) / filtered.length;
}

function getTopHabit(habits, days) {
  const leaderboard = habits
    .map((habit) => ({
      ...habit,
      completed: days.reduce((total, day) => total + (habit.history?.[day.key] ? 1 : 0), 0),
    }))
    .sort((left, right) => right.completed - left.completed);

  return leaderboard[0] || null;
}

function getSuggestedNudge(totalHabits, completedToday) {
  if (totalHabits === 0) return 'Start with 1-3 habits only. Low friction beats ambition.';
  if (completedToday === totalHabits) return 'Day closed. Save the feeling and come back tomorrow.';
  if (completedToday === 0) return 'One tap is enough to restart momentum today.';
  return 'Keep the loop tiny: one more action and stop.';
}

function formatMacros(entry) {
  const normalized = normalizeMacroEntry(entry);
  return [
    { key: 'protein', label: 'Protein', value: normalized.protein, unit: 'g' },
    { key: 'fat', label: 'Fat', value: normalized.fat, unit: 'g' },
    { key: 'carbs', label: 'Carbs', value: normalized.carbs, unit: 'g' },
  ];
}

function totalMacroGrams(entry) {
  const normalized = normalizeMacroEntry(entry);
  return normalized.protein + normalized.fat + normalized.carbs;
}

function buildSmartChefSuggestions({ remainingCalories, proteinGap, carbsGap, fatGap, fridgeText }) {
  const ingredients = fridgeText
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const fridgeLine = ingredients.length ? `Use what you already have: ${ingredients.slice(0, 5).join(', ')}.` : 'Works even if the fridge list is still empty.';

  const ideas = [];

  if (proteinGap > 30) {
    ideas.push({
      title: 'Protein rescue bowl',
      body: `${fridgeLine} Aim for a lean protein anchor and keep it under roughly ${Math.max(220, Math.min(remainingCalories, 520))} kcal.`,
    });
  }

  if (remainingCalories > 350 && carbsGap > 20) {
    ideas.push({
      title: 'Balanced carb close',
      body: 'Add one calm carb source plus protein, so the day closes without a late-night sugar spike.',
    });
  }

  if (fatGap > 18) {
    ideas.push({
      title: 'Satiety plate',
      body: 'A small fat source with protein can make the finish feel satisfying instead of snacky.',
    });
  }

  if (remainingCalories < 220) {
    ideas.push({
      title: 'Minimal finish',
      body: 'Keep the ending tiny: yogurt, eggs, cottage cheese, tuna or another simple protein-first option.',
    });
  }

  if (!ideas.length) {
    ideas.push({
      title: 'Maintenance close',
      body: 'You are near target already. Choose a light protein or stop here and protect the rhythm.',
    });
  }

  return ideas.slice(0, 3);
}

function addMacroEntries(left, right) {
  const leftNormalized = normalizeMacroEntry(left);
  const rightNormalized = normalizeMacroEntry(right);

  return {
    protein: clamp(leftNormalized.protein + rightNormalized.protein, 0, 1000),
    fat: clamp(leftNormalized.fat + rightNormalized.fat, 0, 1000),
    carbs: clamp(leftNormalized.carbs + rightNormalized.carbs, 0, 1000),
  };
}

function SparkLayer({ bursts }) {
  return (
    <div className="spark-layer" aria-hidden="true">
      {bursts.map((burst) => (
        <div
          key={burst.id}
          className="spark-burst"
          style={{ left: `${burst.x}px`, top: `${burst.y}px`, '--spark-color': burst.color, '--spark-glow': burst.glow }}
        >
          <span className="spark-core" />
          {PARTICLES.map((particle) => (
            <span
              key={particle}
              className="spark"
              style={{ '--angle': `${particle * 36}deg`, '--distance': `${28 + (particle % 4) * 8}px` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function DayStrip({ days, selectedDateKey, onSelect }) {
  return (
    <div className="day-strip" aria-label="Week picker">
      {days.map((day) => (
        <button
          key={day.key}
          type="button"
          className={['day-pill', day.key === selectedDateKey ? 'is-selected' : '', day.isToday ? 'is-today' : ''].filter(Boolean).join(' ')}
          onClick={() => onSelect(day.key)}
        >
          <span>{day.weekday}</span>
          <strong>{day.dayNumber}</strong>
        </button>
      ))}
    </div>
  );
}

function HabitRow({ habit, days, selectedDateKey, onToggle, onEdit }) {
  const isComplete = Boolean(habit.history?.[selectedDateKey]);
  const streak = computeStreak(habit.history);
  const weeklyHits = days.reduce((total, day) => total + (habit.history?.[day.key] ? 1 : 0), 0);

  return (
    <article
      className={['habit-row', isComplete ? 'is-complete' : ''].filter(Boolean).join(' ')}
      style={{
        '--habit-accent': habit.color,
        '--habit-soft': hexToRgba(habit.color, 0.12),
        '--habit-border': hexToRgba(habit.color, 0.24),
        '--habit-glow': hexToRgba(habit.color, 0.18),
      }}
    >
      <div className="habit-row-head">
        <div className="habit-avatar" aria-hidden="true">{habit.icon}</div>

        <div className="habit-copy">
          <h3>{habit.name}</h3>
          <p>{habit.cue}</p>
          <div className="mini-week">
            {days.map((day) => (
              <span
                key={day.key}
                className={['mini-dot', habit.history?.[day.key] ? 'is-filled' : '', day.key === selectedDateKey ? 'is-focus' : ''].filter(Boolean).join(' ')}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="habit-row-actions">
        <button type="button" className="icon-button" onClick={() => onEdit(habit)} aria-label={`Edit ${habit.name}`}>
          <span className="material-symbols-outlined">edit</span>
        </button>

        <button
          type="button"
          className={['tick-button', isComplete ? 'is-complete' : ''].filter(Boolean).join(' ')}
          onClick={(event) => onToggle(habit.id, event.currentTarget, habit.color)}
          aria-label={isComplete ? `Undo ${habit.name}` : `Complete ${habit.name}`}
        >
          <span className="material-symbols-outlined">{isComplete ? 'done_all' : 'check'}</span>
        </button>
      </div>

      <div className="habit-row-foot">
        <span>{streak} day streak</span>
        <span>{weeklyHits}/7 this week</span>
      </div>
    </article>
  );
}

function HabitSheet({ draft, isEditing, onChange, onSave, onDelete, onClose }) {
  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true">
      <form
        className="sheet-card"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <div className="sheet-handle" />

        <div className="sheet-head">
          <div>
            <span className="eyebrow">HABIT SETUP</span>
            <h2>{isEditing ? 'Refine this habit' : 'Add a tiny habit'}</h2>
          </div>

          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <label className="field">
          <span>Name</span>
          <input type="text" value={draft.name} onChange={(event) => onChange('name', event.target.value)} placeholder="Cold shower" maxLength={36} />
        </label>

        <label className="field">
          <span>Cue</span>
          <input type="text" value={draft.cue} onChange={(event) => onChange('cue', event.target.value)} placeholder="3 minutes after waking up" maxLength={54} />
        </label>

        <div className="sheet-grid">
          <label className="field">
            <span>Icon</span>
            <input type="text" value={draft.icon} onChange={(event) => onChange('icon', event.target.value.slice(0, 2))} placeholder="✨" />
          </label>

          <div className="field">
            <span>Color</span>
            <div className="color-row">
              {COLOR_SWATCHES.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={['color-chip', draft.color === color ? 'is-active' : ''].filter(Boolean).join(' ')}
                  style={{ backgroundColor: color }}
                  onClick={() => onChange('color', color)}
                  aria-label={`Select ${color}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="sheet-actions">
          {isEditing ? (
            <button type="button" className="ghost-danger" onClick={onDelete}>Delete habit</button>
          ) : (
            <button type="button" className="ghost-button" onClick={onClose}>Cancel</button>
          )}

          <button type="submit" className="primary-button">{isEditing ? 'Save changes' : 'Create habit'}</button>
        </div>
      </form>
    </div>
  );
}

function OnboardingOverlay({ draft, selectedPresets, onFieldChange, onTogglePreset, onSubmit }) {
  return (
    <div className="onboarding-backdrop">
      <section className="onboarding-card">
        <span className="eyebrow">MOMENTUM SETUP</span>
        <h1>Build an iPhone rhythm you will actually return to.</h1>
        <p>
          We start small on purpose: one week, one tap, one tiny win at a time.
          Pick up to three habits so the app feels easy every day.
        </p>

        <div className="onboarding-fields">
          <label className="field">
            <span>Your name</span>
            <input type="text" value={draft.name} onChange={(event) => onFieldChange('name', event.target.value)} placeholder="Sofia" maxLength={24} />
          </label>

          <label className="field">
            <span>Main intention</span>
            <input type="text" value={draft.intention} onChange={(event) => onFieldChange('intention', event.target.value)} placeholder="Calm energy and lean routine" maxLength={48} />
          </label>

          <div className="sheet-grid">
            <label className="field">
              <span>Calorie target</span>
              <input type="number" min="1200" max="5000" step="10" value={draft.calorieTarget} onChange={(event) => onFieldChange('calorieTarget', event.target.value)} />
            </label>

            <label className="field">
              <span>Sleep goal</span>
              <input type="number" min="5" max="12" step="0.5" value={draft.sleepTarget} onChange={(event) => onFieldChange('sleepTarget', event.target.value)} />
            </label>
          </div>
        </div>

        <div className="preset-picker">
          {PRESET_HABITS.map((habit) => {
            const isSelected = selectedPresets.includes(habit.id);

            return (
              <button
                key={habit.id}
                type="button"
                className={['preset-card', isSelected ? 'is-selected' : ''].filter(Boolean).join(' ')}
                onClick={() => onTogglePreset(habit.id)}
              >
                <span className="preset-icon" aria-hidden="true">{habit.icon}</span>
                <strong>{habit.name}</strong>
                <small>{habit.cue}</small>
              </button>
            );
          })}
        </div>

        <button type="button" className="primary-button onboarding-button" onClick={onSubmit}>
          Start my first week
        </button>
      </section>
    </div>
  );
}

function StateCard({
  tone = 'neutral',
  icon = 'info',
  eyebrow,
  title,
  body,
  actionLabel,
  onAction,
  actionDisabled = false,
  secondaryActionLabel,
  onSecondaryAction,
  secondaryActionDisabled = false,
  compact = false,
}) {
  return (
    <div className={['state-card', `is-${tone}`, compact ? 'is-compact' : ''].filter(Boolean).join(' ')}>
      <div className="state-card-icon" aria-hidden="true">
        <span className="material-symbols-outlined">{icon}</span>
      </div>

      <div className="state-card-copy">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <strong>{title}</strong>
        <p>{body}</p>

        {actionLabel || secondaryActionLabel ? (
          <div className="state-card-actions">
            {actionLabel ? (
              <button type="button" className="ghost-button" onClick={onAction} disabled={actionDisabled}>
                {actionLabel}
              </button>
            ) : null}

            {secondaryActionLabel ? (
              <button type="button" className="text-link-button" onClick={onSecondaryAction} disabled={secondaryActionDisabled}>
                {secondaryActionLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SettingToggle({ label, description, checked, disabled = false, onToggle }) {
  return (
    <button
      type="button"
      className={['setting-row', checked ? 'is-active' : '', disabled ? 'is-disabled' : ''].filter(Boolean).join(' ')}
      onClick={onToggle}
      disabled={disabled}
    >
      <div className="setting-copy">
        <strong>{label}</strong>
        <p>{description}</p>
      </div>

      <span className={['toggle-pill', checked ? 'is-active' : ''].filter(Boolean).join(' ')}>
        <span className="toggle-thumb" />
      </span>
    </button>
  );
}

function ProfileSheet({
  profileName,
  cloudUserEmail,
  cloudStatusText,
  cloudState,
  activeSection,
  onSelectSection,
  onClose,
}) {
  return (
    <div className="sheet-backdrop profile-menu-backdrop" role="dialog" aria-modal="true">
      <section className="sheet-card profile-sheet profile-menu-sheet">
        <div className="sheet-handle" />

        <div className="sheet-head">
          <div>
            <span className="eyebrow">PROFILE MENU</span>
            <h2>{profileName}</h2>
          </div>

          <button type="button" className="icon-button" onClick={onClose} aria-label="Close profile settings">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="profile-sheet-summary">
          <div className="brand-block">
            <div className="avatar-badge">{(profileName[0] || 'M').toUpperCase()}</div>
            <div>
              <strong>{cloudUserEmail || 'Local iPhone mode'}</strong>
              <p>{cloudStatusText}</p>
            </div>
          </div>

          <span className="metric-pill">{cloudState.user ? 'Account live' : 'Guest mode'}</span>
        </div>

        <div className="profile-menu-list">
          {SETTINGS_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className={['profile-menu-item', activeSection === section.id ? 'is-active' : ''].filter(Boolean).join(' ')}
              onClick={() => onSelectSection(section.id)}
            >
              <span className="material-symbols-outlined">{section.icon}</span>
              <span className="profile-menu-copy">
                <strong>{section.label}</strong>
                <small>{section.description}</small>
              </span>
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function GlobalTopBar({ eyebrow, title, subtitle, profileName, statusLabel, onOpenProfile }) {
  return (
    <header className="top-bar app-global-bar">
      <div className="global-title">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>

      <button type="button" className="profile-launch" onClick={onOpenProfile} aria-label="Open profile and settings">
        <div className="profile-launch-copy">
          <span>{statusLabel}</span>
          <strong>{profileName}</strong>
        </div>

        <div className="profile-launch-trailing">
          <span className="material-symbols-outlined">tune</span>
          <div className="avatar-badge is-small">{(profileName[0] || 'M').toUpperCase()}</div>
        </div>
      </button>
    </header>
  );
}

export default function App() {
  const [state, setState] = useState(() => loadState());
  const [activeTab, setActiveTab] = useState('habits');
  const [activeSettingsSection, setActiveSettingsSection] = useState('account');
  const [selectedDateKey, setSelectedDateKey] = useState(formatDateKey(new Date()));
  const [showOnboarding, setShowOnboarding] = useState(() => !loadState().profile.onboardingComplete);
  const [hasHydratedDb, setHasHydratedDb] = useState(false);
  const [onboardingDraft, setOnboardingDraft] = useState({
    name: '',
    intention: '',
    calorieTarget: DEFAULT_CALORIE_TARGET,
    sleepTarget: DEFAULT_SLEEP_TARGET,
    selectedPresets: PRESET_HABITS.slice(0, 3).map((habit) => habit.id),
  });
  const [journalDraft, setJournalDraft] = useState(() => {
    const loaded = loadState();
    const todayEntry = loaded.journal.find((entry) => entry.dateKey === formatDateKey(new Date()));
    return todayEntry?.text || '';
  });
  const [bursts, setBursts] = useState([]);
  const [isHabitSheetOpen, setHabitSheetOpen] = useState(false);
  const [isProfileSheetOpen, setProfileSheetOpen] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
  const [habitDraft, setHabitDraft] = useState(createHabitDraft());
  const photoInputRef = useRef(null);
  const manualNoteInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const reminderTimerRef = useRef([]);
  const [captureState, setCaptureState] = useState({
    photoName: '',
    photoDataUrl: '',
    photoFile: null,
    voiceStatus: 'idle',
    voiceTranscript: '',
    manualNote: '',
    barcodeValue: '',
    providerHint: 'Ready for a real AI meal pipeline: capture, parse, confirm, save.',
    lastSource: '',
  });
  const initialDateKeyRef = useRef(selectedDateKey);
  const autoSyncTimerRef = useRef(null);
  const [authDraft, setAuthDraft] = useState({
    email: '',
    password: '',
    displayName: '',
    mode: 'signin',
  });
  const [accountDraft, setAccountDraft] = useState({
    displayName: '',
    intention: '',
  });
  const [passwordDraft, setPasswordDraft] = useState({
    nextPassword: '',
    confirmPassword: '',
    reauthCode: '',
  });
  const [authUi, setAuthUi] = useState({
    showAuthPassword: false,
    showNewPassword: false,
  });
  const [cloudState, setCloudState] = useState({
    configured: isSupabaseConfigured,
    status: isSupabaseConfigured ? 'checking' : 'setup_required',
    session: null,
    user: null,
    profile: null,
    lastSyncedAt: '',
    error: '',
    notice: '',
    isAuthenticating: false,
    isSendingRecoveryEmail: false,
    isResendingConfirmation: false,
    isSavingProfile: false,
    isSendingReauth: false,
    isUpdatingPassword: false,
    isSyncing: false,
    isRestoring: false,
    recoveryMode: false,
  });
  const [mealHistory, setMealHistory] = useState([]);
  const [smartChefDraft, setSmartChefDraft] = useState('');
  const [mealHistoryState, setMealHistoryState] = useState({
    isLoading: false,
    error: '',
  });
  const [analysisState, setAnalysisState] = useState({
    status: 'idle',
    error: '',
    result: null,
  });
  const [deviceNotice, setDeviceNotice] = useState('');
  const [isCloudBootstrapping, setIsCloudBootstrapping] = useState(false);
  const latestStateRef = useRef(state);
  const recoveryNotice = 'Recovery link verified. Set a new password to finish signing back in.';

  const weekDays = useMemo(() => getRecentDays(RHYTHM_DAYS), []);
  const todayKey = weekDays[weekDays.length - 1]?.key || formatDateKey(new Date());
  const selectedDay = weekDays.find((day) => day.key === selectedDateKey) || weekDays[weekDays.length - 1];

  useEffect(() => {
    let isCancelled = false;

    async function hydrateFromDb() {
      try {
        const databaseState = await loadAppState();
        if (!databaseState || isCancelled) {
          setHasHydratedDb(true);
          return;
        }

        const normalized = normalizeState(databaseState);
        setState(normalized);
        setShowOnboarding(!normalized.profile.onboardingComplete);
        const currentEntry = normalized.journal.find((entry) => entry.dateKey === initialDateKeyRef.current);
        setJournalDraft(currentEntry?.text || '');
      } catch (error) {
        console.error('Unable to hydrate app database', error);
      } finally {
        if (!isCancelled) setHasHydratedDb(true);
      }
    }

    hydrateFromDb();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    latestStateRef.current = state;

    if (!hasHydratedDb) return;

    saveAppState(state).catch((error) => {
      console.error('Unable to save app database', error);
    });
  }, [hasHydratedDb, state]);

  useEffect(() => () => {
    recognitionRef.current?.stop?.();
  }, []);

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallPromptEvent(event);
    }

    function handleAppInstalled() {
      setInstallPromptEvent(null);
      setDeviceNotice('Momentum is installed. Open it from your Home Screen for the most native feel.');
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    reminderTimerRef.current.forEach((timerId) => window.clearTimeout(timerId));
    reminderTimerRef.current = [];

    if (
      notificationPermission !== 'granted'
      || !state.preferences.notifications.pushReminders
    ) {
      return undefined;
    }

    const reminderConfig = [
      state.preferences.notifications.morningCheckIn
        ? { key: 'morning', hour: state.retention.morningHour, title: 'Momentum morning check-in', body: RETURN_PROMPTS.morning }
        : null,
      state.preferences.notifications.eveningCheckIn
        ? { key: 'evening', hour: state.retention.eveningHour, title: 'Momentum evening check-in', body: RETURN_PROMPTS.evening }
        : null,
    ].filter(Boolean);

    reminderConfig.forEach((item) => {
      const now = new Date();
      const target = new Date();
      target.setHours(item.hour, 0, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
      const delay = target.getTime() - now.getTime();
      const timerId = window.setTimeout(() => {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(item.title, {
            body: item.body,
            tag: `momentum-${item.key}`,
            icon: '/momentum-icon.svg',
            badge: '/momentum-icon.svg',
          });
        }
      }, delay);
      reminderTimerRef.current.push(timerId);
    });

    return () => {
      reminderTimerRef.current.forEach((timerId) => window.clearTimeout(timerId));
      reminderTimerRef.current = [];
    };
  }, [
    notificationPermission,
    state.preferences.notifications.eveningCheckIn,
    state.preferences.notifications.morningCheckIn,
    state.preferences.notifications.pushReminders,
    state.retention.eveningHour,
    state.retention.morningHour,
  ]);

  async function refreshMealHistory(userId) {
    if (!userId) {
      setMealHistory([]);
      return;
    }

    setMealHistoryState({ isLoading: true, error: '' });

    try {
      const meals = await fetchMealCaptures(userId, { limit: 18 });
      setMealHistory(meals);
      setMealHistoryState({ isLoading: false, error: '' });
    } catch (error) {
      setMealHistory([]);
      setMealHistoryState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Meal history could not be loaded.',
      });
    }
  }

  const bootstrapSignedInUser = useEffectEvent(async (user, options = {}) => {
    if (!user) return;

    const shouldPreferCloud = options.preferCloudSnapshot !== false;
    const stickyNotice = options.notice || '';
    setIsCloudBootstrapping(true);

    try {
      const profile = await fetchCloudProfile(user.id);

      setCloudState((previous) => ({
        ...previous,
        profile,
        error: '',
        notice: stickyNotice,
      }));

      setAccountDraft({
        displayName: profile?.display_name || latestStateRef.current.profile.name || '',
        intention: latestStateRef.current.profile.intention || '',
      });

      const snapshot = await pullCloudSnapshot(user.id);

      if (shouldPreferCloud && snapshot?.payload) {
        const normalized = normalizeState(snapshot.payload);
        setState(normalized);
        setShowOnboarding(!normalized.profile.onboardingComplete);
        const entry = normalized.journal.find((item) => item.dateKey === selectedDateKey);
        setJournalDraft(entry?.text || '');
        setAccountDraft({
          displayName: profile?.display_name || normalized.profile.name || '',
          intention: normalized.profile.intention || '',
        });
        setCloudState((previous) => ({
          ...previous,
          lastSyncedAt: snapshot.updated_at || previous.lastSyncedAt,
          error: '',
          notice: stickyNotice,
        }));
      } else {
        const synced = await pushCloudSnapshot(user.id, latestStateRef.current);
        setCloudState((previous) => ({
          ...previous,
          lastSyncedAt: synced?.updated_at || new Date().toISOString(),
          error: '',
          notice: stickyNotice || 'Cloud backup created for this account.',
        }));
      }

      await refreshMealHistory(user.id);
    } catch (error) {
      setCloudState((previous) => ({
        ...previous,
        status: 'error',
        error: formatAuthMessage(error instanceof Error ? error.message : 'Cloud account could not be prepared.'),
        notice: '',
      }));
    } finally {
      setIsCloudBootstrapping(false);
    }
  });

  useEffect(() => {
    let isCancelled = false;

    async function hydrateCloud() {
      if (!isSupabaseConfigured) {
        setCloudState((previous) => ({ ...previous, status: 'setup_required', notice: '', recoveryMode: false }));
        return;
      }

      try {
        const { session, user } = await getCloudSession();
        const recoveryMode = Boolean(user && isRecoveryRedirect());
        if (isCancelled) return;

        setCloudState((previous) => ({
          ...previous,
          session,
          user,
          status: recoveryMode ? 'recovery' : user ? 'authenticated' : 'ready',
          profile: previous.profile,
          error: '',
          notice: recoveryMode ? recoveryNotice : '',
          recoveryMode,
        }));

        if (user?.email) {
          setAuthDraft((previous) => ({
            ...previous,
            email: user.email,
            mode: 'signin',
            password: '',
          }));
        }

        if (recoveryMode) {
          setActiveSettingsSection('account');
          setActiveTab('settings');
          setPasswordDraft((previous) => ({ ...previous, nextPassword: '', confirmPassword: '', reauthCode: '' }));
          clearAuthRedirectUrl();
        }

        if (user) {
          await bootstrapSignedInUser(user, recoveryMode ? { notice: recoveryNotice } : {});
        }
      } catch (error) {
        if (isCancelled) return;

        setCloudState((previous) => ({
          ...previous,
          status: 'error',
          error: formatAuthMessage(error instanceof Error ? error.message : 'Cloud session could not be restored.'),
          notice: '',
        }));
      }
    }

    hydrateCloud();
    const unsubscribe = onCloudAuthChange(({ event, session, user }) => {
      if (isCancelled) return;

      const recoveryMode = event === 'PASSWORD_RECOVERY';
      const shouldBootstrap = event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'PASSWORD_RECOVERY';

      setCloudState((previous) => ({
        ...previous,
        session,
        user,
        status: recoveryMode ? 'recovery' : user ? 'authenticated' : 'ready',
        profile: user ? previous.profile : null,
        error: '',
        notice: recoveryMode ? recoveryNotice : event === 'USER_UPDATED' ? previous.notice : '',
        recoveryMode: recoveryMode ? true : user ? previous.recoveryMode : false,
      }));

      if (user?.email) {
        setAuthDraft((previous) => ({
          ...previous,
          email: user.email,
          mode: 'signin',
          password: recoveryMode ? '' : previous.password,
        }));
      }

      if (recoveryMode) {
        setActiveSettingsSection('account');
        setActiveTab('settings');
        setPasswordDraft((previous) => ({ ...previous, nextPassword: '', confirmPassword: '', reauthCode: '' }));
        clearAuthRedirectUrl();
      }

      if (!user) {
        setMealHistory([]);
        setMealHistoryState({ isLoading: false, error: '' });
        setAccountDraft({
          displayName: latestStateRef.current.profile.name || '',
          intention: latestStateRef.current.profile.intention || '',
        });
        return;
      }

      if (shouldBootstrap) {
        bootstrapSignedInUser(user, recoveryMode ? { notice: recoveryNotice } : {});
      }
    });

    return () => {
      isCancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (cloudState.user) return;

    setAccountDraft({
      displayName: state.profile.name || '',
      intention: state.profile.intention || '',
    });
  }, [cloudState.user, state.profile.intention, state.profile.name]);

  const selectedHabitCount = countHabitsForDay(state.habits, selectedDateKey);
  const todayHabitCount = countHabitsForDay(state.habits, todayKey);
  const selectedCheckins = state.retention.checkins?.[selectedDateKey] || { morning: false, evening: false };
  const totalHabits = state.habits.length;
  const bestStreak = totalHabits ? Math.max(...state.habits.map((habit) => computeStreak(habit.history))) : 0;
  const weeklyProgress = weekDays.map((day) => ({
    ...day,
    completed: countHabitsForDay(state.habits, day.key),
    calories: Number(state.calories.entries?.[day.key]) || 0,
    sleep: Number(state.sleep.entries?.[day.key]) || 0,
  }));
  const weeklyCompletionAverage = totalHabits
    ? Math.round((weeklyProgress.reduce((total, day) => total + day.completed, 0) / (totalHabits * RHYTHM_DAYS)) * 100)
    : 0;
  const selectedCalories = Number(state.calories.entries?.[selectedDateKey]) || 0;
  const selectedMacros = normalizeMacroEntry(state.calories.macros?.[selectedDateKey]);
  const macroCards = formatMacros(selectedMacros);
  const proteinTarget = Number(state.calories.proteinTarget) || 140;
  const macroTargets = {
    protein: proteinTarget,
    fat: Math.round(((Number(state.calories.target) || DEFAULT_CALORIE_TARGET) * 0.3) / 9),
    carbs: Math.round(((Number(state.calories.target) || DEFAULT_CALORIE_TARGET) * 0.4) / 4),
  };
  const proteinGap = Math.max(0, macroTargets.protein - selectedMacros.protein);
  const carbsGap = Math.max(0, macroTargets.carbs - selectedMacros.carbs);
  const fatGap = Math.max(0, macroTargets.fat - selectedMacros.fat);
  const calorieRemaining = (Number(state.calories.target) || DEFAULT_CALORIE_TARGET) - selectedCalories;
  const calorieProgress = Number(state.calories.target)
    ? clamp(Math.round((selectedCalories / state.calories.target) * 100), 0, 100)
    : 0;
  const averageSleep = computeAverage(weeklyProgress.map((day) => day.sleep));
  const sleepTargetHitDays = weeklyProgress.filter((day) => day.sleep >= (Number(state.sleep.target) || DEFAULT_SLEEP_TARGET) - 0.25).length;
  const topHabit = getTopHabit(state.habits, weekDays);
  const selectedJournalEntry = state.journal.find((entry) => entry.dateKey === selectedDateKey);
  const recentJournalEntries = [...state.journal].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)).slice(0, 3);
  const nudgeText = getSuggestedNudge(totalHabits, todayHabitCount);
  const selectedDayLabel = selectedDay?.isToday
    ? 'Today'
    : formatShortDate(selectedDay.iso, { weekday: 'long', day: 'numeric', month: 'short' });
  const profileName = state.profile.name || cloudState.profile?.display_name || 'there';
  const motionEnabled = state.preferences.app.habitCelebrations && !state.preferences.app.reduceMotion;
  const isStandalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone);
  const voiceStatusLabel = {
    idle: 'Mic ready',
    listening: 'Listening',
    captured: 'Voice captured',
    unavailable: 'Native mic later',
    error: 'Mic blocked',
  }[captureState.voiceStatus];
  const combinedCaptureNote = [captureState.voiceTranscript.trim(), captureState.manualNote.trim()].filter(Boolean).join('. ');
  const cloudUserEmail = cloudState.user?.email || authDraft.email;
  const cloudStatusLabel = cloudState.recoveryMode
    ? 'Reset password'
    : cloudState.user
      ? 'Cloud live'
      : cloudState.configured
        ? 'Ready to connect'
        : 'Setup needed';
  const cloudStatusText = cloudState.recoveryMode
    ? recoveryNotice
    : cloudState.lastSyncedAt
    ? `Last sync ${formatShortDate(new Date(cloudState.lastSyncedAt), {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : cloudState.user
      ? 'Cloud backup is available for this account.'
      : 'Sign in with email and password to unlock cross-device backup.';
  const mealsForSelectedDay = mealHistory.filter((meal) => meal.date_key === selectedDateKey);
  const visibleMeals = mealsForSelectedDay.length ? mealsForSelectedDay : mealHistory.slice(0, 6);
  const topBarMeta = {
    habits: {
      eyebrow: 'MOMENTUM',
      title: 'Habit tracker',
      subtitle: `${selectedDayLabel} • ${selectedHabitCount} closed • ${state.preferences.app.dailyNudges ? 'Gentle nudges on' : 'Quiet mode'}`,
    },
    calories: {
      eyebrow: 'MOMENTUM',
      title: 'Calorie tracking',
      subtitle: `${selectedDayLabel} • ${selectedCalories || 0} kcal logged`,
    },
    insights: {
      eyebrow: getGreeting().toUpperCase(),
      title: 'Insights',
      subtitle: state.profile.intention || 'Weekly clarity, streaks, sleep and return-friendly momentum.',
    },
    settings: {
      eyebrow: 'PROFILE',
      title: SETTINGS_SECTIONS.find((section) => section.id === activeSettingsSection)?.label || 'Settings',
      subtitle: cloudState.user
        ? 'Аккаунт, уведомления и поведение приложения теперь живут отдельно от insights.'
        : 'Открой вход, настройки приложения и будущие подписки в отдельном пространстве.',
    },
  }[activeTab];
  const activeSettingsMeta = SETTINGS_SECTIONS.find((section) => section.id === activeSettingsSection) || SETTINGS_SECTIONS[0];
  const smartChefIdeas = buildSmartChefSuggestions({
    remainingCalories: Math.max(0, calorieRemaining),
    proteinGap,
    carbsGap,
    fatGap,
    fridgeText: smartChefDraft,
  });
  const unlockedAchievementCount = ACHIEVEMENT_LIBRARY.filter((achievement) => state.achievements?.[achievement.id]).length;
  const accountStats = [
    { label: 'Meals saved', value: cloudState.user ? String(mealHistory.length) : '0' },
    { label: 'Email', value: cloudState.recoveryMode ? 'Recovery' : cloudState.user?.email_confirmed_at ? 'Verified' : cloudState.user ? 'Check inbox' : 'Offline' },
    { label: 'Backup', value: cloudState.lastSyncedAt ? 'Live' : cloudState.user ? 'Ready' : 'Locked' },
  ];
  const shouldShowConfirmationBanner = !cloudState.user && (
    cloudState.notice.includes('Account created. If Supabase asks for email confirmation')
    || cloudState.notice.includes('Confirmation email sent again.')
    || cloudState.error === 'Confirm your email once in Supabase, then sign in.'
  );
  const shouldShowRecoveryBanner = !cloudState.user && cloudState.notice.includes('Recovery email sent.');
  const shouldShowSuccessBanner = cloudState.user && (
    cloudState.notice.includes('Password reset complete.')
    || cloudState.notice.includes('Signed in successfully.')
    || cloudState.notice.includes('Account created and signed in.')
  );
  const shouldShowPlainNotice = Boolean(cloudState.notice)
    && !shouldShowConfirmationBanner
    && !shouldShowRecoveryBanner
    && !shouldShowSuccessBanner
    && !cloudState.recoveryMode;
  const analyzedMacros = normalizeMacroEntry(analysisState.result?.totalMacros);
  const metabolicNote = analysisState.result?.glycemicNote || analysisState.result?.coachNote || '';
  const energyPrediction = analysisState.result?.energyForecast || '';
  const favoriteMeals = state.foodLibrary.favorites || [];
  const recentMealTemplates = mealHistory
    .slice(0, 4)
    .map((meal) => ({
      id: meal.id,
      summary: meal.summary || meal.transcript || meal.image_name || 'Recent meal',
      foods: Array.isArray(meal.foods) ? meal.foods : [],
      totalCalories: Number(meal.total_calories) || 0,
      totalMacros: normalizeMacroEntry(meal.total_macros),
      source: 'recent',
      createdAt: meal.created_at || new Date().toISOString(),
    }));
  const isPro = state.subscription.plan === 'pro';
  const visibleSmartChefIdeas = isPro ? smartChefIdeas : smartChefIdeas.slice(0, 1);
  const installSupported = Boolean(installPromptEvent) || !isStandalone;
  const checkInCompletion = Number(selectedCheckins.morning) + Number(selectedCheckins.evening);

  useEffect(() => {
    if (!cloudState.user || !hasHydratedDb || isCloudBootstrapping) return undefined;

    if (autoSyncTimerRef.current) window.clearTimeout(autoSyncTimerRef.current);

    autoSyncTimerRef.current = window.setTimeout(async () => {
      try {
        const synced = await pushCloudSnapshot(cloudState.user.id, state);
        setCloudState((previous) => ({
          ...previous,
          lastSyncedAt: synced?.updated_at || new Date().toISOString(),
          error: '',
        }));
      } catch (error) {
        setCloudState((previous) => ({
          ...previous,
          error: error instanceof Error ? error.message : 'Cloud sync failed.',
        }));
      }
    }, 1400);

    return () => {
      if (autoSyncTimerRef.current) window.clearTimeout(autoSyncTimerRef.current);
    };
  }, [cloudState.user, hasHydratedDb, isCloudBootstrapping, state]);

  function launchBurst(element, color) {
    const rect = element.getBoundingClientRect();
    const burst = {
      id: uid(),
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      color,
      glow: hexToRgba(color, 0.28),
    };

    setBursts((previous) => [...previous, burst]);
    window.setTimeout(() => {
      setBursts((previous) => previous.filter((item) => item.id !== burst.id));
    }, 720);
  }

  function updateHabitDraft(field, value) {
    setHabitDraft((previous) => ({ ...previous, [field]: value }));
  }

  function selectDate(dateKey) {
    const targetEntry = state.journal.find((entry) => entry.dateKey === dateKey);
    setSelectedDateKey(dateKey);
    setJournalDraft(targetEntry?.text || '');
  }

  function openNewHabitSheet() {
    setHabitDraft(createHabitDraft(state.habits.length));
    setHabitSheetOpen(true);
  }

  function openEditHabitSheet(habit) {
    setHabitDraft({
      id: habit.id,
      name: habit.name,
      cue: habit.cue,
      icon: habit.icon,
      color: habit.color,
    });
    setHabitSheetOpen(true);
  }

  function saveHabit() {
    const name = habitDraft.name.trim();
    if (!name) return;

    setState((previous) => {
      if (habitDraft.id) {
        return {
          ...previous,
          habits: previous.habits.map((habit) =>
            habit.id === habitDraft.id
              ? { ...habit, name, cue: habitDraft.cue.trim() || 'Tiny daily win', icon: habitDraft.icon.trim() || '✨', color: habitDraft.color }
              : habit,
          ),
        };
      }

      return {
        ...previous,
        habits: [
          ...previous.habits,
          { id: uid(), name, cue: habitDraft.cue.trim() || 'Tiny daily win', icon: habitDraft.icon.trim() || '✨', color: habitDraft.color, history: {} },
        ],
      };
    });

    setHabitSheetOpen(false);
    setHabitDraft(createHabitDraft(state.habits.length + 1));
  }

  function deleteHabit() {
    if (!habitDraft.id) return;

    setState((previous) => ({
      ...previous,
      habits: previous.habits.filter((habit) => habit.id !== habitDraft.id),
    }));
    setHabitSheetOpen(false);
    setHabitDraft(createHabitDraft(state.habits.length));
  }

  function toggleHabitCompletion(habitId, element, color) {
    const targetHabit = state.habits.find((habit) => habit.id === habitId);
    const wasComplete = Boolean(targetHabit?.history?.[selectedDateKey]);

    setState((previous) => ({
      ...previous,
      habits: previous.habits.map((habit) => {
        if (habit.id !== habitId) return habit;

        const history = { ...habit.history };
        if (history[selectedDateKey]) delete history[selectedDateKey];
        else history[selectedDateKey] = true;

        return { ...habit, history };
      }),
    }));

    if (!wasComplete) launchBurst(element, color);
  }

  function updateSleep(value) {
    const parsedValue = Number(value);

    setState((previous) => {
      const entries = { ...previous.sleep.entries };
      if (value === '' || !Number.isFinite(parsedValue) || parsedValue <= 0) delete entries[selectedDateKey];
      else entries[selectedDateKey] = clamp(parsedValue, 1, 16);

      return { ...previous, sleep: { ...previous.sleep, entries } };
    });
  }

  function updateSleepTarget(value) {
    const parsedValue = Number(value);
    setState((previous) => ({
      ...previous,
      sleep: {
        ...previous.sleep,
        target: value === '' || !Number.isFinite(parsedValue) ? DEFAULT_SLEEP_TARGET : clamp(parsedValue, 5, 12),
      },
    }));
  }

  function updateCalories(value) {
    const parsedValue = Number(value);

    setState((previous) => {
      const entries = { ...previous.calories.entries };
      if (value === '' || !Number.isFinite(parsedValue) || parsedValue <= 0) delete entries[selectedDateKey];
      else entries[selectedDateKey] = clamp(parsedValue, 0, 10000);

      return { ...previous, calories: { ...previous.calories, entries } };
    });
  }

  function updateCalorieTarget(value) {
    const parsedValue = Number(value);
    setState((previous) => ({
      ...previous,
      calories: {
        ...previous.calories,
        target: value === '' || !Number.isFinite(parsedValue) ? DEFAULT_CALORIE_TARGET : clamp(parsedValue, 1200, 5000),
      },
    }));
  }

  function updateProteinTarget(value) {
    const parsedValue = Number(value);
    setState((previous) => ({
      ...previous,
      calories: {
        ...previous.calories,
        proteinTarget: value === '' || !Number.isFinite(parsedValue) ? 140 : clamp(parsedValue, 40, 240),
      },
    }));
  }

  function adjustCalories(delta) {
    updateCalories(String(Math.max(0, selectedCalories + delta)));
  }

  function openPhotoPicker() {
    photoInputRef.current?.click();
  }

  function focusManualCapture() {
    setCaptureState((previous) => ({
      ...previous,
      lastSource: 'manual',
      providerHint: 'Type the meal naturally, and AI will estimate calories, BJU and follow-up guidance.',
    }));
    setAnalysisState({ status: 'idle', error: '', result: null });
    manualNoteInputRef.current?.focus();
  }

  async function handlePhotoSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const photoDataUrl = await readFileAsDataUrl(file);

      setCaptureState((previous) => ({
        ...previous,
        photoName: file.name,
        photoDataUrl: typeof photoDataUrl === 'string' ? photoDataUrl : '',
        photoFile: file,
        lastSource: 'photo',
        providerHint: 'Photo captured. Next step: detect foods, estimate servings, then let the user confirm calories.',
      }));
      setAnalysisState({ status: 'idle', error: '', result: null });
    } catch (error) {
      setAnalysisState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Photo could not be read on this device.',
        result: null,
      });
    }

    event.target.value = '';
  }

  function startVoiceCapture() {
    const SpeechRecognition = typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;

    if (!SpeechRecognition) {
      setCaptureState((previous) => ({
        ...previous,
        voiceStatus: 'unavailable',
        lastSource: 'voice',
        providerHint: 'Browser voice logging is limited on iPhone Safari. For production, connect native iOS speech or Expo audio capture.',
      }));
      return;
    }

    if (captureState.voiceStatus === 'listening') {
      recognitionRef.current?.stop?.();
      return;
    }

    recognitionRef.current?.stop?.();

    const recognition = new SpeechRecognition();
    recognition.lang = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setCaptureState((previous) => ({
        ...previous,
        voiceStatus: 'listening',
        lastSource: 'voice',
        providerHint: 'Listening for meal name and quantity. Example: chicken rice bowl, about 450 grams.',
      }));
      setAnalysisState({ status: 'idle', error: '', result: null });
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || '')
        .join(' ')
        .trim();

      setCaptureState((previous) => ({
        ...previous,
        voiceTranscript: transcript,
        voiceStatus: event.results[event.results.length - 1]?.isFinal ? 'captured' : 'listening',
        lastSource: 'voice',
        providerHint: transcript
          ? 'Voice captured. Next step: parse foods, infer serving sizes, then show editable nutrition cards.'
          : previous.providerHint,
      }));
    };

    recognition.onerror = () => {
      setCaptureState((previous) => ({
        ...previous,
        voiceStatus: 'error',
        lastSource: 'voice',
        providerHint: 'Mic permission was denied or this browser stopped speech recognition.',
      }));
    };

    recognition.onend = () => {
      setCaptureState((previous) => ({
        ...previous,
        voiceStatus: previous.voiceTranscript ? 'captured' : previous.voiceStatus === 'error' ? 'error' : 'idle',
      }));
    };

    recognition.start();
  }

  function updateAuthDraft(field, value) {
    setAuthDraft((previous) => ({ ...previous, [field]: value }));
  }

  function updateAccountDraft(field, value) {
    setAccountDraft((previous) => ({ ...previous, [field]: value }));
  }

  function updatePasswordDraft(field, value) {
    setPasswordDraft((previous) => ({ ...previous, [field]: value }));
  }

  function updateAuthUi(field, value) {
    setAuthUi((previous) => ({ ...previous, [field]: value }));
  }

  function updateCaptureField(field, value) {
    setCaptureState((previous) => ({
      ...previous,
      [field]: value,
      ...(field === 'manualNote' && value.trim()
        ? {
            lastSource: previous.lastSource || 'manual',
            providerHint: 'Typed meal note is ready. Add a photo or voice note too if you want tighter estimates.',
          }
        : {}),
      ...(field === 'barcodeValue' && value.trim()
        ? {
            lastSource: previous.lastSource || 'manual',
            providerHint: 'Fallback search is ready. Combine it with photo or voice if the meal needs more detail.',
          }
        : {}),
    }));
  }

  function updateReminderHour(period, value) {
    const parsedValue = Number(value);
    const fallback = period === 'morning' ? 9 : 20;
    setState((previous) => ({
      ...previous,
      retention: {
        ...previous.retention,
        [`${period}Hour`]: !Number.isFinite(parsedValue)
          ? fallback
          : clamp(Math.round(parsedValue), period === 'morning' ? 5 : 16, period === 'morning' ? 12 : 23),
      },
    }));
  }

  function toggleCheckIn(period) {
    setState((previous) => ({
      ...previous,
      retention: {
        ...previous.retention,
        checkins: {
          ...previous.retention.checkins,
          [selectedDateKey]: {
            morning: Boolean(previous.retention.checkins?.[selectedDateKey]?.morning),
            evening: Boolean(previous.retention.checkins?.[selectedDateKey]?.evening),
            [period]: !previous.retention.checkins?.[selectedDateKey]?.[period],
          },
        },
      },
    }));
  }

  async function requestNotificationAccess() {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported');
      setDeviceNotice('This browser does not support notifications. The installable app or native iPhone build will handle reminders better.');
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission === 'granted') {
      setState((previous) => ({
        ...previous,
        preferences: {
          ...previous.preferences,
          notifications: {
            ...previous.preferences.notifications,
            pushReminders: true,
          },
        },
      }));
      setDeviceNotice('Notifications are enabled. Momentum can now send gentle return prompts while the app is open or installed.');
    } else {
      setDeviceNotice('Notifications stayed blocked. You can still use in-app check-ins and Home Screen mode.');
    }
  }

  function sendTestNotification() {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      setDeviceNotice('Enable notifications first, then the test reminder will work.');
      return;
    }

    new Notification('Momentum test reminder', {
      body: 'Tiny step, not a perfect day. Open the app and close one small loop.',
      tag: 'momentum-test',
      icon: '/momentum-icon.svg',
      badge: '/momentum-icon.svg',
    });
  }

  async function promptInstallApp() {
    if (installPromptEvent?.prompt) {
      await installPromptEvent.prompt();
      const choiceResult = await installPromptEvent.userChoice;
      setDeviceNotice(
        choiceResult?.outcome === 'accepted'
          ? 'Momentum install started. Open it from the Home Screen for a more app-like feel.'
          : 'Install prompt dismissed. You can still add it later from the browser menu.',
      );
      setInstallPromptEvent(null);
      return;
    }

    setDeviceNotice(
      isStandalone
        ? 'Momentum is already running from the Home Screen.'
        : 'On iPhone Safari tap Share and choose Add to Home Screen for the cleanest app-like experience.',
    );
  }

  function updateAnalysisFood(index, field, value) {
    setAnalysisState((previous) => {
      if (!previous.result) return previous;

      const foods = (previous.result.foods || []).map((food, foodIndex) => {
        if (foodIndex !== index) return food;

        if (['calories', 'protein', 'fat', 'carbs'].includes(field)) {
          return {
            ...food,
            [field]: clamp(Number(value) || 0, 0, 5000),
          };
        }

        return {
          ...food,
          [field]: value,
        };
      });

      const totals = sumFoods(foods);
      return {
        ...previous,
        result: {
          ...previous.result,
          foods,
          totalCalories: totals.totalCalories,
          totalMacros: totals.totalMacros,
        },
      };
    });
  }

  function saveAnalysisToFavorites() {
    if (!analysisState.result) return;

    const favorite = normalizeFavoriteMeal({
      id: uid(),
      summary: analysisState.result.summary || 'Saved meal',
      source: analysisState.result.provider || 'ai',
      foods: analysisState.result.foods,
      totalCalories: analysisState.result.totalCalories || 0,
      totalMacros: analysisState.result.totalMacros,
      createdAt: new Date().toISOString(),
      note: captureState.manualNote,
    });

    setState((previous) => ({
      ...previous,
      foodLibrary: {
        ...previous.foodLibrary,
        favorites: [
          favorite,
          ...previous.foodLibrary.favorites.filter((item) => item.summary !== favorite.summary).slice(0, 11),
        ],
      },
    }));
  }

  function removeFavoriteMeal(favoriteId) {
    setState((previous) => ({
      ...previous,
      foodLibrary: {
        ...previous.foodLibrary,
        favorites: previous.foodLibrary.favorites.filter((item) => item.id !== favoriteId),
      },
    }));
  }

  function applyMealTemplate(template, mode = 'add') {
    if (!template) return;

    const totals = {
      totalCalories: clamp(Number(template.totalCalories) || 0, 0, 10000),
      totalMacros: normalizeMacroEntry(template.totalMacros),
    };

    setState((previous) => {
      const currentCalories = Number(previous.calories.entries?.[selectedDateKey]) || 0;
      const currentMacros = normalizeMacroEntry(previous.calories.macros?.[selectedDateKey]);
      return {
        ...previous,
        calories: {
          ...previous.calories,
          entries: {
            ...previous.calories.entries,
            [selectedDateKey]: mode === 'replace' ? totals.totalCalories : clamp(currentCalories + totals.totalCalories, 0, 10000),
          },
          macros: {
            ...previous.calories.macros,
            [selectedDateKey]: mode === 'replace' ? totals.totalMacros : addMacroEntries(currentMacros, totals.totalMacros),
          },
        },
        foodLibrary: {
          ...previous.foodLibrary,
          favorites: previous.foodLibrary.favorites.map((item) =>
            item.id === template.id ? { ...item, lastUsedAt: new Date().toISOString() } : item,
          ),
        },
      };
    });

    setCaptureState((previous) => ({
      ...previous,
      providerHint: `${template.summary || 'Saved meal'} applied to ${selectedDayLabel.toLowerCase()}.`,
    }));
  }

  function toggleSubscriptionPlan(plan) {
    setState((previous) => ({
      ...previous,
      subscription: {
        ...previous.subscription,
        plan,
        startedAt: plan === 'pro' ? previous.subscription.startedAt || new Date().toISOString() : null,
      },
    }));
  }

  function toggleSubscriptionBilling(billing) {
    setState((previous) => ({
      ...previous,
      subscription: {
        ...previous.subscription,
        billing,
      },
    }));
  }

  function togglePreference(section, key) {
    setState((previous) => ({
      ...previous,
      preferences: {
        ...previous.preferences,
        [section]: {
          ...previous.preferences[section],
          [key]: !previous.preferences[section][key],
        },
      },
    }));
  }

  function openAccountCenter() {
    setActiveSettingsSection('account');
    setActiveTab('settings');
    setProfileSheetOpen(false);
  }

  function openSettingsSection(sectionId = 'account') {
    setActiveSettingsSection(sectionId);
    setActiveTab('settings');
    setProfileSheetOpen(false);
  }

  function toggleAchievement(achievementId) {
    setState((previous) => ({
      ...previous,
      achievements: {
        ...previous.achievements,
        [achievementId]: !previous.achievements?.[achievementId],
      },
    }));
  }

  async function handlePasswordAuth(mode) {
    const email = authDraft.email.trim();
    const password = authDraft.password;

    if (!email || !password) {
      setCloudState((previous) => ({ ...previous, error: 'Enter both email and password first.', notice: '' }));
      return;
    }

    if (mode === 'signup' && !authDraft.displayName.trim()) {
      setCloudState((previous) => ({ ...previous, error: 'Add your name so the profile feels personal from day one.', notice: '' }));
      return;
    }

    setCloudState((previous) => ({ ...previous, isAuthenticating: true, error: '', notice: '' }));

    try {
      if (mode === 'signup') {
        const data = await signUpWithPassword({
          email,
          password,
          displayName: authDraft.displayName.trim(),
        });

        if (!data.session && data.user) {
          setAuthDraft((previous) => ({
            ...previous,
            mode: 'signin',
            password: '',
          }));
          setCloudState((previous) => ({
            ...previous,
            isAuthenticating: false,
            status: 'ready',
            error: '',
            recoveryMode: false,
            notice: 'Account created. If Supabase asks for email confirmation, confirm once and then sign in.',
          }));
          return;
        }
      } else {
        await signInWithPassword({ email, password });
      }

      setAuthDraft((previous) => ({
        ...previous,
        email,
        password: '',
      }));
      setCloudState((previous) => ({
        ...previous,
        isAuthenticating: false,
        status: 'authenticated',
        error: '',
        recoveryMode: false,
        notice: mode === 'signup' ? 'Account created and signed in.' : 'Signed in successfully.',
      }));
    } catch (error) {
      setCloudState((previous) => ({
        ...previous,
        isAuthenticating: false,
        status: 'error',
        error: formatAuthMessage(error instanceof Error ? error.message : 'Account auth failed.'),
        notice: '',
      }));
    }
  }

  async function sendRecoveryEmail() {
    const email = authDraft.email.trim();

    if (!email) {
      setCloudState((previous) => ({ ...previous, error: 'Enter your email first, then I can send the recovery link.', notice: '' }));
      return;
    }

    setCloudState((previous) => ({
      ...previous,
      isSendingRecoveryEmail: true,
      error: '',
      notice: '',
    }));

    try {
      await requestPasswordReset(email);
      setAuthDraft((previous) => ({
        ...previous,
        email,
        mode: 'signin',
        password: '',
      }));
      setCloudState((previous) => ({
        ...previous,
        isSendingRecoveryEmail: false,
        status: 'ready',
        error: '',
        notice: 'Recovery email sent. Open the link on this iPhone and choose a new password.',
      }));
    } catch (error) {
      setCloudState((previous) => ({
        ...previous,
        isSendingRecoveryEmail: false,
        status: 'error',
        error: formatAuthMessage(error instanceof Error ? error.message : 'Recovery email could not be sent.'),
        notice: '',
      }));
    }
  }

  async function resendConfirmationEmail() {
    const email = authDraft.email.trim();

    if (!email) {
      setCloudState((previous) => ({ ...previous, error: 'Enter your email first so I know where to resend confirmation.', notice: '' }));
      return;
    }

    setCloudState((previous) => ({
      ...previous,
      isResendingConfirmation: true,
      error: '',
      notice: '',
    }));

    try {
      await resendSignupConfirmation(email);
      setCloudState((previous) => ({
        ...previous,
        isResendingConfirmation: false,
        error: '',
        notice: 'Confirmation email sent again. One tap in your inbox should unlock sign in.',
      }));
    } catch (error) {
      setCloudState((previous) => ({
        ...previous,
        isResendingConfirmation: false,
        status: 'error',
        error: formatAuthMessage(error instanceof Error ? error.message : 'Confirmation email could not be resent.'),
        notice: '',
      }));
    }
  }

  async function syncSnapshotToCloud({ silent = false } = {}) {
    if (!cloudState.user) {
      if (!silent) {
        setCloudState((previous) => ({ ...previous, error: 'Connect your email first, then cloud backup will unlock.', notice: '' }));
      }
      return;
    }

    setCloudState((previous) => ({ ...previous, isSyncing: true, error: '', notice: '' }));

    try {
      const synced = await pushCloudSnapshot(cloudState.user.id, state);
      setCloudState((previous) => ({
        ...previous,
        isSyncing: false,
        lastSyncedAt: synced?.updated_at || new Date().toISOString(),
        error: '',
        notice: 'Cloud backup updated.',
      }));
    } catch (error) {
      setCloudState((previous) => ({
        ...previous,
        isSyncing: false,
        status: 'error',
        error: formatAuthMessage(error instanceof Error ? error.message : 'Cloud sync failed.'),
        notice: '',
      }));
    }
  }

  async function restoreSnapshotFromCloud() {
    if (!cloudState.user) {
      setCloudState((previous) => ({ ...previous, error: 'Sign in first so I can restore your backup.', notice: '' }));
      return;
    }

    setCloudState((previous) => ({ ...previous, isRestoring: true, error: '', notice: '' }));

    try {
      const snapshot = await pullCloudSnapshot(cloudState.user.id);

      if (!snapshot?.payload) {
        setCloudState((previous) => ({
          ...previous,
          isRestoring: false,
          error: 'No backup exists in Supabase yet.',
          notice: '',
        }));
        return;
      }

      const normalized = normalizeState(snapshot.payload);
      setState(normalized);
      setShowOnboarding(!normalized.profile.onboardingComplete);
      const entry = normalized.journal.find((item) => item.dateKey === selectedDateKey);
      setJournalDraft(entry?.text || '');
      setAccountDraft({
        displayName: cloudState.profile?.display_name || normalized.profile.name || '',
        intention: normalized.profile.intention || '',
      });

      setCloudState((previous) => ({
        ...previous,
        isRestoring: false,
        lastSyncedAt: snapshot.updated_at || previous.lastSyncedAt,
        error: '',
        notice: 'Cloud backup restored onto this device.',
      }));
    } catch (error) {
      setCloudState((previous) => ({
        ...previous,
        isRestoring: false,
        status: 'error',
        error: formatAuthMessage(error instanceof Error ? error.message : 'Cloud restore failed.'),
        notice: '',
      }));
    }
  }

  async function disconnectCloud() {
    try {
      await signOutFromCloud();
      setMealHistory([]);
      setMealHistoryState({ isLoading: false, error: '' });
      setAuthDraft((previous) => ({ ...previous, mode: 'signin', password: '' }));
      setPasswordDraft({ nextPassword: '', confirmPassword: '', reauthCode: '' });
      setCloudState((previous) => ({
        ...previous,
        session: null,
        user: null,
        profile: null,
        status: 'ready',
        error: '',
        recoveryMode: false,
        notice: 'Signed out on this device.',
      }));
    } catch (error) {
      setCloudState((previous) => ({
        ...previous,
        status: 'error',
        error: formatAuthMessage(error instanceof Error ? error.message : 'Cloud sign out failed.'),
        notice: '',
      }));
    }
  }

  async function saveAccountProfile() {
    const displayName = accountDraft.displayName.trim();
    const intention = accountDraft.intention.trim();

    setState((previous) => ({
      ...previous,
      profile: {
        ...previous.profile,
        name: displayName,
        intention,
      },
    }));

    if (!cloudState.user) return;

    setCloudState((previous) => ({ ...previous, isSavingProfile: true, error: '', notice: '' }));

    try {
      const profile = await updateCloudProfile(cloudState.user.id, {
        email: cloudState.user.email,
        display_name: displayName,
      });

      setCloudState((previous) => ({
        ...previous,
        profile,
        isSavingProfile: false,
        error: '',
        notice: 'Profile saved.',
      }));
    } catch (error) {
      setCloudState((previous) => ({
        ...previous,
        isSavingProfile: false,
        status: 'error',
        error: formatAuthMessage(error instanceof Error ? error.message : 'Profile could not be saved.'),
        notice: '',
      }));
    }
  }

  async function changeAccountPassword() {
    const nextPassword = passwordDraft.nextPassword;
    const confirmPassword = passwordDraft.confirmPassword;
    const reauthCode = passwordDraft.reauthCode.trim();

    if (!cloudState.user) {
      setCloudState((previous) => ({ ...previous, error: 'Sign in first so password settings are attached to your account.', notice: '' }));
      return;
    }

    if (!nextPassword || !confirmPassword) {
      setCloudState((previous) => ({ ...previous, error: 'Enter the new password twice.', notice: '' }));
      return;
    }

    if (nextPassword.length < 6) {
      setCloudState((previous) => ({ ...previous, error: 'Password is too short. Use at least 6 characters.', notice: '' }));
      return;
    }

    if (nextPassword !== confirmPassword) {
      setCloudState((previous) => ({ ...previous, error: 'Passwords do not match yet.', notice: '' }));
      return;
    }

    setCloudState((previous) => ({ ...previous, isUpdatingPassword: true, error: '', notice: '' }));

    try {
      await updateCloudPassword(nextPassword, reauthCode || undefined);
      clearAuthRedirectUrl();
      setPasswordDraft({ nextPassword: '', confirmPassword: '', reauthCode: '' });
      setAuthDraft((previous) => ({ ...previous, password: '' }));
      setCloudState((previous) => ({
        ...previous,
        isUpdatingPassword: false,
        status: 'authenticated',
        recoveryMode: false,
        error: '',
        notice: previous.recoveryMode ? 'Password reset complete. You are back in.' : 'Password updated.',
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Password could not be updated.';
      setCloudState((previous) => ({
        ...previous,
        isUpdatingPassword: false,
        status: 'error',
        error: formatAuthMessage(message),
        notice: needsPasswordReauth(message)
          ? 'Tap Email code, paste the code below, then try the password change again.'
          : '',
      }));
    }
  }

  async function sendPasswordCode() {
    if (!cloudState.user) {
      setCloudState((previous) => ({ ...previous, error: 'Sign in first so the code is tied to your account.', notice: '' }));
      return;
    }

    setCloudState((previous) => ({
      ...previous,
      isSendingReauth: true,
      error: '',
      notice: '',
    }));

    try {
      await sendPasswordReauth();
      setCloudState((previous) => ({
        ...previous,
        isSendingReauth: false,
        error: '',
        notice: 'Email code sent. Paste it below only if Supabase asks for secure password change.',
      }));
    } catch (error) {
      setCloudState((previous) => ({
        ...previous,
        isSendingReauth: false,
        status: 'error',
        error: formatAuthMessage(error instanceof Error ? error.message : 'Password verification code could not be sent.'),
        notice: '',
      }));
    }
  }

  async function runMealAnalysis() {
    const combinedTranscript = [
      captureState.voiceTranscript.trim(),
      captureState.manualNote.trim(),
      captureState.barcodeValue.trim() ? `Barcode or fallback search: ${captureState.barcodeValue.trim()}` : '',
    ].filter(Boolean).join('. ');
    if (!captureState.photoDataUrl && !combinedTranscript) {
      setAnalysisState({
        status: 'error',
        error: 'Add a meal photo, say the meal out loud, or type the meal first.',
        result: null,
      });
      return;
    }

    setAnalysisState({ status: 'loading', error: '', result: null });

    try {
      let storagePath;

      if (captureState.photoFile && cloudState.user) {
        storagePath = await uploadMealPhoto(cloudState.user.id, captureState.photoFile);
      }

      const result = await analyzeMealCapture({
        source: captureState.lastSource || (captureState.photoDataUrl ? 'photo' : combinedTranscript ? 'manual' : 'voice'),
        transcript: combinedTranscript,
        imageDataUrl: captureState.photoDataUrl || undefined,
        imageName: captureState.photoName || undefined,
        storagePath,
        locale: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
        dateKey: selectedDateKey,
      });

      if (result.status !== 'ok') {
        setAnalysisState({
          status: result.status || 'error',
          error: formatMealAnalysisMessage(result.message || 'Meal analysis is not configured yet.'),
          result: null,
        });
        setCaptureState((previous) => ({
          ...previous,
          providerHint: formatMealAnalysisMessage(result.message || 'Meal analysis is not configured yet.'),
        }));
        return;
      }

      setAnalysisState({ status: 'complete', error: '', result });

      if (result.totalCalories || totalMacroGrams(result.totalMacros)) {
        setState((previous) => {
          const currentValue = Number(previous.calories.entries?.[selectedDateKey]) || 0;
          const currentMacros = normalizeMacroEntry(previous.calories.macros?.[selectedDateKey]);
          const nextMacros = addMacroEntries(currentMacros, result.totalMacros);
          return {
            ...previous,
            calories: {
              ...previous.calories,
              entries: {
                ...previous.calories.entries,
                [selectedDateKey]: clamp(currentValue + (result.totalCalories || 0), 0, 10000),
              },
              macros: {
                ...previous.calories.macros,
                [selectedDateKey]: nextMacros,
              },
            },
          };
        });
      }

      setCaptureState((previous) => ({
        ...previous,
        providerHint: result.totalCalories
          ? `${result.totalCalories} kcal and BJU added to ${selectedDayLabel.toLowerCase()}.`
          : 'Meal parsed. BJU are ready even if calories still need a nutrition provider.',
      }));

      if (result.savedId && !state.achievements?.['first-scan']) {
        setState((previous) => ({
          ...previous,
          achievements: {
            ...previous.achievements,
            'first-scan': true,
          },
        }));
      }

      if (cloudState.user) {
        await refreshMealHistory(cloudState.user.id);
      }
    } catch (error) {
      setAnalysisState({
        status: 'error',
        error: formatMealAnalysisMessage(error instanceof Error ? error.message : 'Meal analysis failed.'),
        result: null,
      });
      setCaptureState((previous) => ({
        ...previous,
        providerHint: formatMealAnalysisMessage(error instanceof Error ? error.message : 'Meal analysis failed.'),
      }));
    }
  }

  function applyAnalyzedCalories() {
    if (!analysisState.result?.totalCalories) return;
    setState((previous) => ({
      ...previous,
      calories: {
        ...previous.calories,
        entries: {
          ...previous.calories.entries,
          [selectedDateKey]: clamp(analysisState.result.totalCalories, 0, 10000),
        },
        macros: {
          ...previous.calories.macros,
          [selectedDateKey]: normalizeMacroEntry(analysisState.result.totalMacros),
        },
      },
    }));
  }

  function saveJournalEntry() {
    const text = journalDraft.trim();

    setState((previous) => {
      const existing = previous.journal.find((entry) => entry.dateKey === selectedDateKey);

      if (!text) {
        return { ...previous, journal: previous.journal.filter((entry) => entry.dateKey !== selectedDateKey) };
      }

      if (existing) {
        return {
          ...previous,
          journal: previous.journal.map((entry) =>
            entry.dateKey === selectedDateKey ? { ...entry, text, updatedAt: new Date().toISOString() } : entry,
          ),
        };
      }

      return {
        ...previous,
        journal: [{ id: uid(), dateKey: selectedDateKey, text, createdAt: new Date().toISOString(), updatedAt: null }, ...previous.journal],
      };
    });
  }

  function updateOnboardingDraft(field, value) {
    setOnboardingDraft((previous) => ({ ...previous, [field]: value }));
  }

  function togglePresetSelection(presetId) {
    setOnboardingDraft((previous) => {
      const isSelected = previous.selectedPresets.includes(presetId);
      if (isSelected) return { ...previous, selectedPresets: previous.selectedPresets.filter((item) => item !== presetId) };
      if (previous.selectedPresets.length >= 3) return previous;
      return { ...previous, selectedPresets: [...previous.selectedPresets, presetId] };
    });
  }

  function completeOnboarding() {
    const presets = PRESET_HABITS.filter((habit) => onboardingDraft.selectedPresets.includes(habit.id));

    setState((previous) => ({
      ...previous,
      profile: {
        name: onboardingDraft.name.trim(),
        intention: onboardingDraft.intention.trim(),
        onboardingComplete: true,
      },
      calories: { ...previous.calories, target: Number(onboardingDraft.calorieTarget) || DEFAULT_CALORIE_TARGET },
      sleep: { ...previous.sleep, target: Number(onboardingDraft.sleepTarget) || DEFAULT_SLEEP_TARGET },
      habits: previous.habits.length
        ? previous.habits
        : presets.map((habit, index) => ({
            id: uid(),
            name: habit.name,
            cue: habit.cue,
            icon: habit.icon,
            color: habit.color || COLOR_SWATCHES[index % COLOR_SWATCHES.length],
            history: {},
          })),
    }));

    setShowOnboarding(false);
  }

  function resetEverything() {
    if (!window.confirm('Reset all habits, calories, sleep and reflections?')) return;

    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    clearAppState().catch((error) => {
      console.error('Unable to clear app database', error);
    });
    setState(createDefaultState());
    setShowOnboarding(true);
    selectDate(todayKey);
    setActiveTab('habits');
    setProfileSheetOpen(false);
    setJournalDraft('');
  }
  const sleepProgress = clamp(((Number(state.sleep.entries?.[selectedDateKey]) || 0) / (Number(state.sleep.target) || DEFAULT_SLEEP_TARGET)) * 100, 0, 100);

  return (
    <div className={['app-shell', state.preferences.app.reduceMotion ? 'is-reduced-motion' : ''].filter(Boolean).join(' ')}>
      {motionEnabled ? <SparkLayer bursts={bursts} /> : null}

      {showOnboarding ? (
        <OnboardingOverlay
          draft={onboardingDraft}
          selectedPresets={onboardingDraft.selectedPresets}
          onFieldChange={updateOnboardingDraft}
          onTogglePreset={togglePresetSelection}
          onSubmit={completeOnboarding}
        />
      ) : null}

      {isHabitSheetOpen ? (
        <HabitSheet
          draft={habitDraft}
          isEditing={Boolean(habitDraft.id)}
          onChange={updateHabitDraft}
          onSave={saveHabit}
          onDelete={deleteHabit}
          onClose={() => setHabitSheetOpen(false)}
        />
      ) : null}

      {isProfileSheetOpen ? (
        <ProfileSheet
          profileName={profileName}
          cloudUserEmail={cloudUserEmail}
          cloudStatusText={cloudStatusText}
          cloudState={cloudState}
          activeSection={activeSettingsSection}
          onSelectSection={openSettingsSection}
          onClose={() => setProfileSheetOpen(false)}
        />
      ) : null}

      <main className="app-frame">
        <GlobalTopBar
          eyebrow={topBarMeta.eyebrow}
          title={topBarMeta.title}
          subtitle={topBarMeta.subtitle}
          profileName={profileName}
          statusLabel={cloudState.user ? 'Profile live' : 'Guest mode'}
          onOpenProfile={() => setProfileSheetOpen(true)}
        />

        {isCloudBootstrapping ? (
          <StateCard
            compact
            tone="loading"
            icon="cloud_sync"
            eyebrow="SYNCING ACCOUNT"
            title="Preparing your cloud profile"
            body="Pulling profile, backup and meal history so this device catches up gently."
          />
        ) : null}

        {activeTab === 'habits' ? (
          <section className="tab-view">
            <section className="section-card">
              <div className="section-head">
                <div>
                  <span className="eyebrow">WEEK FOCUS</span>
                  <h2>{selectedDayLabel}</h2>
                </div>
                <button type="button" className="chip-button" onClick={openNewHabitSheet}>Add habit</button>
              </div>

              <DayStrip days={weekDays} selectedDateKey={selectedDateKey} onSelect={selectDate} />

              <div className="protocol-head">
                <div>
                  <strong>{selectedHabitCount}</strong>
                  <span>completed on this day</span>
                </div>
                <small>Keep it tiny. One tap should be enough to close the loop.</small>
              </div>

              <div className="return-lane">
                {[
                  {
                    key: 'morning',
                    title: 'Morning check-in',
                    body: 'Open the day with one intentional action before everything gets noisy.',
                    done: selectedCheckins.morning,
                  },
                  {
                    key: 'evening',
                    title: 'Evening closure',
                    body: 'Close the day softly with one log, one note or one completed loop.',
                    done: selectedCheckins.evening,
                  },
                ].map((item) => (
                  <article key={item.key} className={['return-card', item.done ? 'is-complete' : ''].filter(Boolean).join(' ')}>
                    <div>
                      <span className="eyebrow">{item.key === 'morning' ? 'AM LOOP' : 'PM LOOP'}</span>
                      <strong>{item.title}</strong>
                      <p>{item.body}</p>
                    </div>

                    <button type="button" className={item.done ? 'ghost-button' : 'primary-button'} onClick={() => toggleCheckIn(item.key)}>
                      {item.done ? 'Done' : 'Check in'}
                    </button>
                  </article>
                ))}
              </div>

              <div className="return-toolbar">
                <span className="metric-pill">{checkInCompletion}/2 check-ins</span>
                <div className="sync-actions">
                  <button type="button" className="ghost-button" onClick={requestNotificationAccess}>
                    {notificationPermission === 'granted' ? 'Notifications on' : 'Enable reminders'}
                  </button>
                  <button type="button" className="ghost-button" onClick={promptInstallApp}>
                    {isStandalone ? 'Home Screen live' : 'Install app'}
                  </button>
                </div>
              </div>

              <div className="habit-list">
                {state.habits.length ? (
                  state.habits.map((habit) => (
                    <HabitRow
                      key={habit.id}
                      habit={habit}
                      days={weekDays}
                      selectedDateKey={selectedDateKey}
                      onToggle={toggleHabitCompletion}
                      onEdit={openEditHabitSheet}
                    />
                  ))
                ) : (
                  <StateCard
                    tone="warm"
                    icon="playlist_add_check_circle"
                    eyebrow="EMPTY START"
                    title="No habits yet"
                    body="Start with one or two. The goal is a daily return, not a huge list."
                    actionLabel="Create first habit"
                    onAction={openNewHabitSheet}
                  />
                )}
              </div>
            </section>

            <section className="section-card">
              <div className="section-head">
                <div>
                  <span className="eyebrow">RECOVERY</span>
                  <h2>Sleep lane</h2>
                </div>
                <span className="metric-pill">Goal {Number(state.sleep.target) || DEFAULT_SLEEP_TARGET}h</span>
              </div>

              <div className="sleep-block">
                <div className="sleep-ring" style={{ '--sleep-progress': `${sleepProgress}%` }}>
                  <div>
                    <strong>{Number(state.sleep.entries?.[selectedDateKey]) || 0}h</strong>
                    <span>logged</span>
                  </div>
                </div>

                <div className="sleep-controls">
                  <label className="field">
                    <span>Hours for selected day</span>
                    <input type="number" min="1" max="16" step="0.5" value={state.sleep.entries?.[selectedDateKey] || ''} onChange={(event) => updateSleep(event.target.value)} placeholder="0" />
                  </label>

                  <label className="field">
                    <span>Weekly sleep goal</span>
                    <input type="number" min="5" max="12" step="0.5" value={state.sleep.target} onChange={(event) => updateSleepTarget(event.target.value)} />
                  </label>
                </div>
              </div>

              <div className="health-card">
                <div>
                  <strong>iPhone sync lane</strong>
                  <p>This build is tuned for iPhone Safari and Add to Home Screen. Native HealthKit auto-sync will plug into the Expo build next.</p>
                </div>

                <span className="status-badge">{isStandalone ? 'Home Screen' : 'Safari mode'}</span>
              </div>
            </section>

            <section className="section-card">
              <div className="section-head">
                <div>
                  <span className="eyebrow">DAILY REFLECTION</span>
                  <h2>Journal at the bottom</h2>
                </div>
                <button type="button" className="chip-button" onClick={saveJournalEntry}>Save entry</button>
              </div>

              <p className="prompt-copy">{JOURNAL_PROMPTS[new Date(selectedDateKey).getDate() % JOURNAL_PROMPTS.length]}</p>

              <textarea
                className="journal-box"
                value={journalDraft}
                onChange={(event) => setJournalDraft(event.target.value)}
                placeholder="Capture the feeling, the friction and the one lesson you want tomorrow."
              />

              <div className="archive-strip">
                {recentJournalEntries.length ? (
                  recentJournalEntries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={['archive-chip', entry.dateKey === selectedDateKey ? 'is-selected' : ''].filter(Boolean).join(' ')}
                    onClick={() => selectDate(entry.dateKey)}
                    >
                      <span>{formatShortDate(new Date(entry.dateKey), { day: 'numeric', month: 'short' })}</span>
                      <strong>{entry.text.slice(0, 28)}{entry.text.length > 28 ? '...' : ''}</strong>
                    </button>
                  ))
                ) : (
                  <StateCard
                    compact
                    tone="neutral"
                    icon="edit_note"
                    eyebrow="WAITING FOR NOTES"
                    title="No archive yet"
                    body="Your notes for each day will appear here."
                  />
                )}
              </div>

              {selectedJournalEntry?.updatedAt ? (
                <small className="last-saved">
                  Updated {formatShortDate(new Date(selectedJournalEntry.updatedAt), { hour: '2-digit', minute: '2-digit' })}
                </small>
              ) : null}
            </section>
          </section>
        ) : null}

        {activeTab === 'calories' ? (
          <section className="tab-view">
            <section className="section-card">
              <div className="section-head">
                <div>
                  <span className="eyebrow">FUEL CHECK</span>
                  <h2>{selectedDayLabel}</h2>
                </div>
                <span className="metric-pill">Target {Number(state.calories.target) || DEFAULT_CALORIE_TARGET}</span>
              </div>

              <DayStrip days={weekDays} selectedDateKey={selectedDateKey} onSelect={selectDate} />

              <div className="calorie-hero">
                <div className="calorie-ring" style={{ '--calorie-progress': `${calorieProgress}%` }}>
                  <div>
                    <strong>{Math.abs(calorieRemaining)}</strong>
                    <span>{calorieRemaining >= 0 ? 'left' : 'over'}</span>
                  </div>
                </div>

                <div className="calorie-copy">
                  <h3>We will make diet tracking feel easy</h3>
                  <p>Calories, protein and meal quality should feel guided, not overwhelming.</p>

                  <label className="field">
                    <span>Calories for selected day</span>
                    <input type="number" min="0" step="10" value={selectedCalories || ''} onChange={(event) => updateCalories(event.target.value)} placeholder="0" />
                  </label>

                  <label className="field">
                    <span>Daily target</span>
                    <input type="number" min="1200" max="5000" step="10" value={state.calories.target} onChange={(event) => updateCalorieTarget(event.target.value)} />
                  </label>

                  <label className="field">
                    <span>Protein target</span>
                    <input type="number" min="40" max="240" step="5" value={state.calories.proteinTarget} onChange={(event) => updateProteinTarget(event.target.value)} />
                  </label>
                </div>
              </div>

              <div className="macro-summary-grid">
                {macroCards.map((macro) => {
                  const targetValue = macroTargets[macro.key];
                  const progress = clamp(Math.round((macro.value / Math.max(targetValue, 1)) * 100), 0, 100);

                  return (
                    <article key={macro.key} className="macro-summary-card">
                      <span>{macro.label}</span>
                      <strong>{macro.value}{macro.unit}</strong>
                      <small>{progress}% of target</small>
                    </article>
                  );
                })}
              </div>

              <div className="quick-add-row">
                {[150, 300, 500].map((value) => (
                  <button key={value} type="button" className="quick-add-chip" onClick={() => adjustCalories(value)}>+{value}</button>
                ))}
                <button type="button" className="quick-add-chip is-ghost" onClick={() => updateCalories('')}>Clear</button>
              </div>
            </section>

            <section className="section-card">
              <div className="section-head">
                <div>
                  <span className="eyebrow">AI DIET ASSISTANT</span>
                  <h2>Hybrid meal capture</h2>
                </div>
                <span className="metric-pill">Photo + voice + BJU</span>
              </div>

              <StateCard
                compact
                tone="warm"
                icon="nutrition"
                eyebrow="COACH MODE"
                title="Tell us the details while you scan"
                body="Take a meal photo and say the extra context naturally: for example, “There was one tablespoon of oil and sweet tea”."
              />

              <div className="capture-grid">
                {CALORIE_CAPTURE_MODES.map((mode) => {
                  const isVoice = mode.id === 'voice';
                  const isManual = mode.id === 'manual';
                  const isActive = captureState.lastSource === mode.id;

                  return (
                    <button
                      key={mode.id}
                      type="button"
                      className={['capture-card', isActive ? 'is-active' : ''].filter(Boolean).join(' ')}
                      onClick={isVoice ? startVoiceCapture : isManual ? focusManualCapture : openPhotoPicker}
                    >
                      <span className="capture-icon material-symbols-outlined">{mode.icon}</span>
                      <strong>{mode.title}</strong>
                      <p>{mode.body}</p>
                      <small>
                        {isVoice
                          ? voiceStatusLabel
                          : isManual
                            ? captureState.manualNote.trim() ? 'Text ready' : 'Type naturally'
                            : captureState.photoName ? 'Photo attached' : 'Camera ready'}
                      </small>
                    </button>
                  );
                })}
              </div>

              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoSelected}
                className="visually-hidden"
              />

              <div className="capture-status">
                <div className="capture-status-head">
                  <strong>Prepared for real OpenAI meal recognition</strong>
                  <span>
                    {captureState.photoName && combinedCaptureNote ? 'Hybrid input ready' : captureState.lastSource ? `Source: ${captureState.lastSource}` : 'Awaiting capture'}
                  </span>
                </div>

                {captureState.photoDataUrl ? <img src={captureState.photoDataUrl} alt={captureState.photoName || 'Meal preview'} className="capture-preview" /> : null}

                <div className="capture-status-line">
                  <span className="material-symbols-outlined">imagesmode</span>
                  <p>{captureState.photoName ? `Latest photo: ${captureState.photoName}` : 'Meal photo will open the iPhone camera or photo picker.'}</p>
                </div>

                <div className="capture-status-line">
                  <span className="material-symbols-outlined">graphic_eq</span>
                  <p>{captureState.voiceTranscript || 'Voice meal text will appear here after transcription.'}</p>
                </div>

                <label className="field">
                  <span>Meal details or extra context</span>
                  <input
                    ref={manualNoteInputRef}
                    type="text"
                    value={captureState.manualNote}
                    onChange={(event) => updateCaptureField('manualNote', event.target.value)}
                    placeholder="Example: two sandwiches with tea, 1 tbsp oil, extra cheese"
                  />
                </label>

                <label className="field">
                  <span>Barcode or manual search fallback</span>
                  <input
                    type="text"
                    value={captureState.barcodeValue}
                    onChange={(event) => updateCaptureField('barcodeValue', event.target.value)}
                    placeholder="Barcode digits or quick search like greek yogurt 2%"
                  />
                </label>

                <div className="capture-status-line">
                  <span className="material-symbols-outlined">edit_note</span>
                  <p>{captureState.manualNote.trim() || 'Typed meal details will appear here if you want to log food without camera or mic.'}</p>
                </div>

                <div className="capture-status-line">
                  <span className="material-symbols-outlined">barcode_scanner</span>
                  <p>{captureState.barcodeValue.trim() || 'Barcode or manual search fallback can rescue the log when camera recognition is uncertain.'}</p>
                </div>

                <p className="capture-note">{captureState.providerHint}</p>
              </div>

              <div className="provider-grid">
                <span className="provider-pill">OpenAI vision + natural language</span>
                <span className="provider-pill">Supabase edge function</span>
                <span className="provider-pill">BJU + glycemic insight</span>
                <span className="provider-pill">Barcode/manual fallback</span>
              </div>

              <div className="sync-actions">
                <button type="button" className="primary-button" onClick={runMealAnalysis}>
                  {analysisState.status === 'loading' ? 'Analyzing meal...' : 'Analyze meal'}
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={applyAnalyzedCalories}
                  disabled={!analysisState.result?.totalCalories}
                >
                  Replace day total
                </button>
              </div>

              {analysisState.status === 'error' && !analysisState.result ? (
                <StateCard
                  tone="warm"
                  icon="error"
                  eyebrow="ANALYSIS BLOCKED"
                  title="The meal request did not finish yet"
                  body={analysisState.error || 'Meal analysis is still missing a valid AI response.'}
                  actionLabel="Try again"
                  onAction={runMealAnalysis}
                  secondaryActionLabel={!cloudState.user ? 'Open account center' : undefined}
                  onSecondaryAction={!cloudState.user ? openAccountCenter : undefined}
                />
              ) : null}

              {analysisState.status !== 'idle' && analysisState.result ? (
                <div className="analysis-card">
                  <div className="analysis-head">
                    <div>
                      <span className="eyebrow">AI OUTPUT</span>
                      <h3>{analysisState.result?.summary || 'Meal analysis'}</h3>
                    </div>
                    <span className="metric-pill">
                      {analysisState.result?.provider || (analysisState.status === 'loading' ? 'Working' : 'Pending')}
                    </span>
                  </div>

                  <div className="analysis-total">
                    <strong>{analysisState.result.totalCalories ?? '—'}</strong>
                    <span>estimated kcal</span>
                  </div>

                  <div className="sync-actions">
                    <button type="button" className="ghost-button" onClick={applyAnalyzedCalories}>
                      Replace day total
                    </button>
                    <button type="button" className="ghost-button" onClick={saveAnalysisToFavorites}>
                      Save to favorites
                    </button>
                  </div>

                  <div className="macro-summary-grid analysis-macro-grid">
                    {formatMacros(analyzedMacros).map((macro) => (
                      <article key={macro.key} className="macro-summary-card">
                        <span>{macro.label}</span>
                        <strong>{macro.value}{macro.unit}</strong>
                        <small>{analysisState.result.provider || 'AI estimate'}</small>
                      </article>
                    ))}
                  </div>

                  {energyPrediction || metabolicNote ? (
                    <div className="analysis-note-stack">
                      {energyPrediction ? (
                        <StateCard
                          compact
                          tone="neutral"
                          icon="bolt"
                          eyebrow="ENERGY FORECAST"
                          title="After-meal prediction"
                          body={energyPrediction}
                        />
                      ) : null}

                      {metabolicNote ? (
                        <StateCard
                          compact
                          tone="warm"
                          icon="bloodtype"
                          eyebrow="GLYCEMIC NOTE"
                          title="How to smooth the response"
                          body={metabolicNote}
                        />
                      ) : null}
                    </div>
                  ) : null}

                  <div className="analysis-food-list">
                    {analysisState.result.foods?.map((food, index) => (
                      <article key={`${food.name}-${index}`} className="analysis-food">
                        <div className="analysis-food-topline">
                          <strong>{food.name}</strong>
                          <span>{food.quantityText || 'Serving pending'}</span>
                        </div>
                        <div className="analysis-food-editor">
                          <label className="field compact-field">
                            <span>Name</span>
                            <input type="text" value={food.name || ''} onChange={(event) => updateAnalysisFood(index, 'name', event.target.value)} />
                          </label>
                          <label className="field compact-field">
                            <span>Qty</span>
                            <input type="text" value={food.quantityText || ''} onChange={(event) => updateAnalysisFood(index, 'quantityText', event.target.value)} />
                          </label>
                          <label className="field compact-field">
                            <span>Kcal</span>
                            <input type="number" min="0" step="1" value={food.calories || 0} onChange={(event) => updateAnalysisFood(index, 'calories', event.target.value)} />
                          </label>
                          <label className="field compact-field">
                            <span>P</span>
                            <input type="number" min="0" step="1" value={food.protein || 0} onChange={(event) => updateAnalysisFood(index, 'protein', event.target.value)} />
                          </label>
                          <label className="field compact-field">
                            <span>F</span>
                            <input type="number" min="0" step="1" value={food.fat || 0} onChange={(event) => updateAnalysisFood(index, 'fat', event.target.value)} />
                          </label>
                          <label className="field compact-field">
                            <span>C</span>
                            <input type="number" min="0" step="1" value={food.carbs || 0} onChange={(event) => updateAnalysisFood(index, 'carbs', event.target.value)} />
                          </label>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="capture-flow">
                <div className="capture-flow-step">
                  <span>1</span>
                  <p>Take a photo and optionally describe oil, sauces, sugar or portions by voice.</p>
                </div>
                <div className="capture-flow-step">
                  <span>2</span>
                  <p>OpenAI parses the meal, then maps foods into calories and BJU.</p>
                </div>
                <div className="capture-flow-step">
                  <span>3</span>
                  <p>The app predicts energy and sugar response, then helps you close the day calmly.</p>
                </div>
              </div>
            </section>

            <section className="section-card">
              <div className="section-head">
                <div>
                  <span className="eyebrow">SMART CHEF</span>
                  <h2>What should I eat?</h2>
                </div>
                <span className="metric-pill">{isPro ? 'Pro live' : 'Free preview'}</span>
              </div>

              <div className="smart-chef-shell">
                <div className="smart-chef-summary">
                  <article className="macro-summary-card">
                    <span>Protein gap</span>
                    <strong>{proteinGap}g</strong>
                    <small>toward target</small>
                  </article>
                  <article className="macro-summary-card">
                    <span>Carb gap</span>
                    <strong>{carbsGap}g</strong>
                    <small>toward target</small>
                  </article>
                  <article className="macro-summary-card">
                    <span>Fat gap</span>
                    <strong>{fatGap}g</strong>
                    <small>toward target</small>
                  </article>
                </div>

                <label className="field">
                  <span>What is in the fridge?</span>
                  <input
                    type="text"
                    value={smartChefDraft}
                    onChange={(event) => setSmartChefDraft(event.target.value)}
                    placeholder="eggs, greek yogurt, chicken, cucumber, rice"
                  />
                </label>

                <div className="insight-stack">
                  {visibleSmartChefIdeas.map((idea) => (
                    <article key={idea.title} className="insight-line">
                      <strong>{idea.title}</strong>
                      <p>{idea.body}</p>
                    </article>
                  ))}
                </div>

                {!isPro ? (
                  <StateCard
                    compact
                    tone="warm"
                    icon="workspace_premium"
                    eyebrow="PRO LAYER"
                    title="Unlock deeper Smart Chef"
                    body="Pro opens more than one suggestion, richer macro closing ideas and the future fridge-to-recipe flow."
                    actionLabel="Open subscriptions"
                    onAction={() => openSettingsSection('subscriptions')}
                  />
                ) : null}
              </div>
            </section>

            <section className="section-card">
              <div className="section-head">
                <div>
                  <span className="eyebrow">TRUST LAYER</span>
                  <h2>Favorites and recent meals</h2>
                </div>
                <span className="metric-pill">{favoriteMeals.length} favorites</span>
              </div>

              {favoriteMeals.length ? (
                <div className="meal-template-grid">
                  {favoriteMeals.slice(0, 6).map((meal) => (
                    <article key={meal.id} className="template-card">
                      <strong>{meal.summary}</strong>
                      <p>{meal.totalCalories || 0} kcal • P {meal.totalMacros.protein} / F {meal.totalMacros.fat} / C {meal.totalMacros.carbs}</p>
                      <div className="sync-actions">
                        <button type="button" className="ghost-button" onClick={() => applyMealTemplate(meal)}>Add to day</button>
                        <button type="button" className="ghost-danger" onClick={() => removeFavoriteMeal(meal.id)}>Remove</button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <StateCard
                  compact
                  tone="neutral"
                  icon="favorite"
                  eyebrow="SAVE THE WINNERS"
                  title="No favorite meals yet"
                  body="After AI analyzes a meal, save it here so the next log can be one tap instead of starting from zero."
                />
              )}

              {recentMealTemplates.length ? (
                <div className="meal-template-grid">
                  {recentMealTemplates.map((meal) => (
                    <article key={meal.id} className="template-card">
                      <strong>{meal.summary}</strong>
                      <p>{meal.totalCalories || 0} kcal • P {meal.totalMacros.protein} / F {meal.totalMacros.fat} / C {meal.totalMacros.carbs}</p>
                      <button type="button" className="ghost-button" onClick={() => applyMealTemplate(meal)}>
                        Reuse this meal
                      </button>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="section-card">
              <div className="section-head">
                <div>
                  <span className="eyebrow">MEAL LOG</span>
                  <h2>{mealsForSelectedDay.length ? `${selectedDayLabel} meals` : 'Recent meal captures'}</h2>
                </div>
                <span className="metric-pill">{cloudState.user ? `${visibleMeals.length} shown` : 'Account needed'}</span>
              </div>

              {!cloudState.user ? (
                <StateCard
                  tone="warm"
                  icon="lock"
                  eyebrow="ACCOUNT NEEDED"
                  title="Sign in to build meal history"
                  body="Each AI capture will save here with calories, foods, and photo previews tied to your account."
                  actionLabel="Open account center"
                  onAction={openAccountCenter}
                />
              ) : mealHistoryState.isLoading ? (
                <StateCard
                  tone="loading"
                  icon="browse_activity"
                  eyebrow="LOADING"
                  title="Pulling your meal history"
                  body="Supabase is fetching recent captures and private image previews."
                />
              ) : visibleMeals.length ? (
                <div className="meal-history-list">
                  {visibleMeals.map((meal) => (
                    <article key={meal.id} className="meal-card">
                      {meal.imageUrl ? <img src={meal.imageUrl} alt={meal.summary || 'Meal capture'} className="meal-thumb" /> : null}

                      <div className="meal-copy">
                        <div className="meal-topline">
                          <strong>{meal.summary || meal.transcript || meal.image_name || 'Meal capture'}</strong>
                          <span>{meal.total_calories ?? '—'} kcal</span>
                        </div>
                        <p>{meal.foods?.slice(0, 3).map((food) => food.name).join(' • ') || 'Foods will appear here after parsing.'}</p>
                        <div className="meal-meta">
                          <span>{meal.provider || 'pending provider'}</span>
                          <span>{formatShortDate(new Date(meal.created_at), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="meal-macro-line">
                          <span>P {Math.round(meal.total_macros?.protein || 0)}</span>
                          <span>F {Math.round(meal.total_macros?.fat || 0)}</span>
                          <span>C {Math.round(meal.total_macros?.carbs || 0)}</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <StateCard
                  tone="neutral"
                  icon="photo_camera"
                  eyebrow="FIRST CAPTURE"
                  title="No meals saved yet"
                  body="Your first photo or voice meal capture will come back here as a reusable food history."
                />
              )}

              {mealHistoryState.error ? <p className="analysis-error">{mealHistoryState.error}</p> : null}
            </section>

            <section className="section-card">
              <div className="section-head">
                <div>
                  <span className="eyebrow">ACHIEVEMENTS</span>
                  <h2>Manual unlock library</h2>
                </div>
                <span className="metric-pill">{unlockedAchievementCount}/{ACHIEVEMENT_LIBRARY.length} active</span>
              </div>

              <div className="achievement-grid">
                {ACHIEVEMENT_LIBRARY.map((achievement) => {
                  const isUnlocked = Boolean(state.achievements?.[achievement.id]);

                  return (
                    <article key={achievement.id} className={['achievement-card', isUnlocked ? 'is-unlocked' : ''].filter(Boolean).join(' ')}>
                      <div className="achievement-topline">
                        <span className="material-symbols-outlined">{achievement.icon}</span>
                        <button type="button" className={isUnlocked ? 'ghost-button' : 'primary-button'} onClick={() => toggleAchievement(achievement.id)}>
                          {isUnlocked ? 'Remove' : 'Add'}
                        </button>
                      </div>
                      <strong>{achievement.title}</strong>
                      <p>{achievement.body}</p>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="section-card">
              <div className="section-head">
                <div>
                  <span className="eyebrow">WEEKLY TREND</span>
                  <h2>Calorie rhythm</h2>
                </div>
                <span className="metric-pill">{weeklyProgress.filter((day) => day.calories > 0).length}/7 logged</span>
              </div>

              <div className="chart-card">
                {weeklyProgress.map((day) => {
                  const height = clamp((day.calories / (Number(state.calories.target) || DEFAULT_CALORIE_TARGET)) * 100, 8, 100);

                  return (
                    <div key={day.key} className="chart-column">
                      <span className="chart-value">{day.calories || 0}</span>
                      <div className="chart-bar-shell">
                        <div className="chart-bar" style={{ height: `${day.calories ? height : 8}%` }} />
                      </div>
                      <strong>{day.weekday}</strong>
                    </div>
                  );
                })}
              </div>
            </section>
          </section>
        ) : null}

        {activeTab === 'settings' ? (
          <section className="tab-view">
            <section className="hero-panel settings-hero">
              <div>
                <span className="eyebrow">SETTINGS SPACE</span>
                <h2>{activeSettingsMeta.label}</h2>
                <p>{activeSettingsMeta.description}</p>
              </div>

              <div className="hero-stats">
                <div className="hero-chip">
                  <span>Account</span>
                  <strong>{cloudState.user ? 'Live' : 'Guest'}</strong>
                </div>
                <div className="hero-chip">
                  <span>Sync</span>
                  <strong>{cloudState.lastSyncedAt ? 'Ready' : cloudState.user ? 'Waiting' : 'Locked'}</strong>
                </div>
              </div>
            </section>

            <section className="section-card">
              <div className="section-head">
                <div>
                  <span className="eyebrow">SECTIONS</span>
                  <h2>Choose what to adjust</h2>
                </div>
                <span className="metric-pill">{SETTINGS_SECTIONS.length} areas</span>
              </div>

              <div className="settings-section-grid">
                {SETTINGS_SECTIONS.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    className={['settings-section-button', activeSettingsSection === section.id ? 'is-active' : ''].filter(Boolean).join(' ')}
                    onClick={() => setActiveSettingsSection(section.id)}
                  >
                    <span className="material-symbols-outlined">{section.icon}</span>
                    <strong>{section.label}</strong>
                    <small>{section.title}</small>
                  </button>
                ))}
              </div>
            </section>

            {activeSettingsSection === 'notifications' ? (
              <section className="section-card">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">УВЕДОМЛЕНИЯ</span>
                    <h2>Push, mail, nudges</h2>
                  </div>
                  <span className="metric-pill">{cloudState.user ? 'Cloud aware' : 'Local first'}</span>
                </div>

                <StateCard
                  compact
                  tone="warm"
                  icon="notifications_active"
                  eyebrow="RETURN LOOP"
                  title="Мягкие напоминания вместо давления"
                  body="Мы держим возврат в приложение лёгким: без чувства вины, с короткими nudges и спокойным email-ритмом."
                />

                <div className="settings-stack">
                  <SettingToggle
                    label="Push reminders"
                    description="Allow Momentum to send gentle return prompts."
                    checked={state.preferences.notifications.pushReminders}
                    onToggle={() => togglePreference('notifications', 'pushReminders')}
                  />

                  <SettingToggle
                    label="Morning check-in"
                    description="Keep a light morning touchpoint visible."
                    checked={state.preferences.notifications.morningCheckIn}
                    onToggle={() => togglePreference('notifications', 'morningCheckIn')}
                  />

                  <SettingToggle
                    label="Evening check-in"
                    description="Close the day with one tiny reflection or meal log."
                    checked={state.preferences.notifications.eveningCheckIn}
                    onToggle={() => togglePreference('notifications', 'eveningCheckIn')}
                  />

                  <SettingToggle
                    label="Daily nudges"
                    description="Keep tiny return-friendly reminders visible inside the app."
                    checked={state.preferences.app.dailyNudges}
                    onToggle={() => togglePreference('app', 'dailyNudges')}
                  />

                  {EMAIL_SETTINGS.map((setting) => (
                    <SettingToggle
                      key={setting.key}
                      label={setting.label}
                      description={setting.description}
                      checked={state.preferences.email[setting.key]}
                      disabled={!cloudState.user}
                      onToggle={() => togglePreference(setting.section, setting.key)}
                    />
                  ))}
                </div>

                <div className="settings-two-up">
                  <label className="field compact-field">
                    <span>Morning hour</span>
                    <input type="number" min="5" max="12" step="1" value={state.retention.morningHour} onChange={(event) => updateReminderHour('morning', event.target.value)} />
                  </label>

                  <label className="field compact-field">
                    <span>Evening hour</span>
                    <input type="number" min="16" max="23" step="1" value={state.retention.eveningHour} onChange={(event) => updateReminderHour('evening', event.target.value)} />
                  </label>
                </div>

                <div className="sync-actions">
                  <button type="button" className="ghost-button" onClick={requestNotificationAccess}>
                    {notificationPermission === 'granted' ? 'Notification access live' : 'Enable notifications'}
                  </button>
                  <button type="button" className="ghost-button" onClick={sendTestNotification}>
                    Send test reminder
                  </button>
                </div>

                {deviceNotice ? <p className="notice-copy">{deviceNotice}</p> : null}
              </section>
            ) : null}

            {activeSettingsSection === 'account' ? (
              <section className="section-card">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">НАСТРОЙКИ АККАУНТА</span>
                    <h2>Identity, sync, profile</h2>
                  </div>
                  <span className="status-badge">{cloudStatusLabel}</span>
                </div>

                <div className="sync-shell">
                  {shouldShowConfirmationBanner ? (
                    <StateCard
                      tone="warm"
                      icon="mark_email_unread"
                      eyebrow="CONFIRM EMAIL"
                      title="One inbox tap finishes setup"
                      body="Supabase is waiting for email confirmation before password sign-in can fully unlock."
                      actionLabel={cloudState.isResendingConfirmation ? 'Sending email...' : 'Resend confirmation'}
                      onAction={resendConfirmationEmail}
                      actionDisabled={cloudState.isResendingConfirmation}
                    />
                  ) : null}

                  {shouldShowRecoveryBanner ? (
                    <StateCard
                      tone="neutral"
                      icon="password"
                      eyebrow="RECOVERY SENT"
                      title="Check your inbox on iPhone"
                      body="Open the secure recovery link from your email. This app will switch into reset mode automatically."
                    />
                  ) : null}

                  {shouldShowSuccessBanner ? (
                    <StateCard
                      tone="success"
                      icon="check_circle"
                      eyebrow="ACCOUNT READY"
                      title="Identity and sync are live"
                      body="You are back in. Cloud backup, meals and account settings can keep moving across devices."
                    />
                  ) : null}

                  {cloudState.recoveryMode ? (
                    <StateCard
                      tone="warm"
                      icon="shield_lock"
                      eyebrow="STEP 2"
                      title="Finish password reset here"
                      body="This tab is already holding your recovery session. Set the new password below and the app will close the loop."
                    />
                  ) : null}

                  {!cloudState.user ? (
                    <>
                      <div className="auth-mode-row">
                        <button
                          type="button"
                          className={['segment-button', authDraft.mode === 'signin' ? 'is-active' : ''].filter(Boolean).join(' ')}
                          onClick={() => updateAuthDraft('mode', 'signin')}
                        >
                          Sign in
                        </button>
                        <button
                          type="button"
                          className={['segment-button', authDraft.mode === 'signup' ? 'is-active' : ''].filter(Boolean).join(' ')}
                          onClick={() => updateAuthDraft('mode', 'signup')}
                        >
                          Create account
                        </button>
                      </div>

                      {authDraft.mode === 'signup' ? (
                        <label className="field">
                          <span>Name</span>
                          <input
                            type="text"
                            value={authDraft.displayName}
                            onChange={(event) => updateAuthDraft('displayName', event.target.value)}
                            placeholder="Your name"
                          />
                        </label>
                      ) : null}

                      <label className="field">
                        <span>Email</span>
                        <input
                          type="email"
                          value={authDraft.email}
                          onChange={(event) => updateAuthDraft('email', event.target.value)}
                          placeholder="you@example.com"
                          disabled={!cloudState.configured}
                        />
                      </label>

                      <label className="field">
                        <span>Password</span>
                        <input
                          type={authUi.showAuthPassword ? 'text' : 'password'}
                          value={authDraft.password}
                          onChange={(event) => updateAuthDraft('password', event.target.value)}
                          placeholder="At least 6 characters"
                          disabled={!cloudState.configured}
                        />
                      </label>

                      <p className="sync-copy">{cloudStatusText}</p>

                      <div className="sync-actions">
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => updateAuthUi('showAuthPassword', !authUi.showAuthPassword)}
                          disabled={!cloudState.configured}
                        >
                          {authUi.showAuthPassword ? 'Hide password' : 'Show password'}
                        </button>

                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => handlePasswordAuth(authDraft.mode)}
                          disabled={!cloudState.configured || cloudState.isAuthenticating}
                        >
                          {cloudState.isAuthenticating
                            ? authDraft.mode === 'signup' ? 'Creating account...' : 'Signing in...'
                            : authDraft.mode === 'signup' ? 'Create account' : 'Sign in'}
                        </button>
                      </div>

                      <div className="auth-link-row">
                        <button
                          type="button"
                          className="text-link-button"
                          onClick={sendRecoveryEmail}
                          disabled={!cloudState.configured || cloudState.isSendingRecoveryEmail}
                        >
                          {cloudState.isSendingRecoveryEmail ? 'Sending recovery...' : 'Forgot password'}
                        </button>

                        <button
                          type="button"
                          className="text-link-button"
                          onClick={resendConfirmationEmail}
                          disabled={!cloudState.configured || cloudState.isResendingConfirmation}
                        >
                          {cloudState.isResendingConfirmation ? 'Sending email...' : 'Resend confirmation'}
                        </button>
                      </div>

                      <div className="account-helper-card">
                        <strong>{authDraft.mode === 'signup' ? 'Why create an account' : 'Why sign in'}</strong>
                        <p>Sync habits, calories, sleep, journal and meal history across devices. Your food photos stay in private Supabase storage.</p>
                        <small className="helper-note">
                          {authDraft.mode === 'signup'
                            ? 'If email confirmation is enabled in Supabase, one inbox tap finishes setup.'
                            : 'Forgot password sends a secure recovery link back to this same screen.'}
                        </small>
                      </div>
                    </>
                  ) : (
                    <>
                      {cloudState.recoveryMode ? (
                        <div className="recovery-card">
                          <div>
                            <span className="eyebrow">PASSWORD RECOVERY</span>
                            <h3>Choose a new password</h3>
                            <p>This secure email link already recognized your account. Finish the reset below, then sync keeps working normally.</p>
                          </div>
                          <span className="metric-pill">Secure link</span>
                        </div>
                      ) : null}

                      <div className="account-summary-card">
                        <div>
                          <span className="eyebrow">{cloudState.recoveryMode ? 'ALMOST THERE' : 'SIGNED IN'}</span>
                          <h3>{accountDraft.displayName || cloudState.profile?.display_name || profileName}</h3>
                          <p>{cloudUserEmail}</p>
                        </div>
                        <span className="metric-pill">{cloudStatusText}</span>
                      </div>

                      <div className="account-stat-grid">
                        {accountStats.map((item) => (
                          <article key={item.label} className="account-stat-card">
                            <span>{item.label}</span>
                            <strong>{item.value}</strong>
                          </article>
                        ))}
                      </div>

                      <label className="field">
                        <span>Display name</span>
                        <input
                          type="text"
                          value={accountDraft.displayName}
                          onChange={(event) => updateAccountDraft('displayName', event.target.value)}
                          placeholder="Display name"
                        />
                      </label>

                      <label className="field">
                        <span>Intention</span>
                        <input
                          type="text"
                          value={accountDraft.intention}
                          onChange={(event) => updateAccountDraft('intention', event.target.value)}
                          placeholder="Calm energy, lean routine, better sleep"
                        />
                      </label>

                      <div className="sync-actions">
                        <button
                          type="button"
                          className="primary-button"
                          onClick={saveAccountProfile}
                          disabled={cloudState.isSavingProfile}
                        >
                          {cloudState.isSavingProfile ? 'Saving profile...' : 'Save profile'}
                        </button>

                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => syncSnapshotToCloud()}
                          disabled={!cloudState.user || cloudState.isSyncing}
                        >
                          {cloudState.isSyncing ? 'Syncing...' : 'Sync now'}
                        </button>
                      </div>

                      <div className="password-stack">
                        <div className="password-panel-head">
                          <div>
                            <span className="eyebrow">{cloudState.recoveryMode ? 'RESET PASSWORD' : 'PASSWORD'}</span>
                            <strong>{cloudState.recoveryMode ? 'Finish recovery on this device' : 'Refresh password safely'}</strong>
                          </div>
                          {cloudState.recoveryMode ? <span className="metric-pill">Step 2</span> : null}
                        </div>

                        <label className="field">
                          <span>New password</span>
                          <input
                            type={authUi.showNewPassword ? 'text' : 'password'}
                            value={passwordDraft.nextPassword}
                            onChange={(event) => updatePasswordDraft('nextPassword', event.target.value)}
                            placeholder="At least 6 characters"
                          />
                        </label>

                        <label className="field">
                          <span>Confirm new password</span>
                          <input
                            type={authUi.showNewPassword ? 'text' : 'password'}
                            value={passwordDraft.confirmPassword}
                            onChange={(event) => updatePasswordDraft('confirmPassword', event.target.value)}
                            placeholder="Repeat new password"
                          />
                        </label>

                        <label className="field">
                          <span>Email code</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={passwordDraft.reauthCode}
                            onChange={(event) => updatePasswordDraft('reauthCode', event.target.value.replace(/\s+/g, ''))}
                            placeholder="Optional: paste code only if Supabase asks"
                          />
                        </label>

                        <p className="sync-copy">If Secure password change is enabled in Supabase, send a code to your inbox and paste it here before retrying.</p>

                        <div className="sync-actions">
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => updateAuthUi('showNewPassword', !authUi.showNewPassword)}
                          >
                            {authUi.showNewPassword ? 'Hide password' : 'Show password'}
                          </button>

                          <button
                            type="button"
                            className="ghost-button"
                            onClick={sendPasswordCode}
                            disabled={cloudState.isSendingReauth}
                          >
                            {cloudState.isSendingReauth ? 'Sending code...' : 'Email code'}
                          </button>

                          <button
                            type="button"
                            className="ghost-button"
                            onClick={changeAccountPassword}
                            disabled={cloudState.isUpdatingPassword}
                          >
                            {cloudState.isUpdatingPassword
                              ? cloudState.recoveryMode ? 'Finishing reset...' : 'Updating password...'
                              : cloudState.recoveryMode ? 'Finish reset' : 'Update password'}
                          </button>
                        </div>
                      </div>

                      <div className="sync-actions">
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={restoreSnapshotFromCloud}
                          disabled={!cloudState.user || cloudState.isRestoring}
                        >
                          {cloudState.isRestoring ? 'Restoring...' : 'Restore backup'}
                        </button>

                        <button
                          type="button"
                          className="ghost-danger"
                          onClick={disconnectCloud}
                          disabled={!cloudState.user}
                        >
                          Sign out
                        </button>
                      </div>
                    </>
                  )}

                  <div className="sync-note-card">
                    <strong>What syncs to cloud</strong>
                    <p>Habits, day history, calories, sleep, journal, profile preferences, and meal captures with private photo storage.</p>
                  </div>

                  {shouldShowPlainNotice ? <p className="notice-copy">{cloudState.notice}</p> : null}
                  {!shouldShowConfirmationBanner && cloudState.error ? <p className="analysis-error">{cloudState.error}</p> : null}
                </div>
              </section>
            ) : null}

            {activeSettingsSection === 'app' ? (
              <section className="section-card">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">НАСТРОЙКИ ПРИЛОЖЕНИЯ</span>
                    <h2>Interface feel</h2>
                  </div>
                  <span className="metric-pill">Saved locally</span>
                </div>

                <div className="settings-stack">
                  {APP_SETTINGS.map((setting) => (
                    <SettingToggle
                      key={setting.key}
                      label={setting.label}
                      description={setting.description}
                      checked={state.preferences.app[setting.key]}
                      onToggle={() => togglePreference(setting.section, setting.key)}
                    />
                  ))}
                </div>

                <div className="native-lane-list">
                  {NATIVE_LANE_FEATURES.map((feature) => (
                    <article key={feature} className="insight-line">
                      <strong>{feature}</strong>
                      <p>{feature === 'Add to Home Screen / PWA install'
                        ? (isStandalone ? 'Already running from the Home Screen.' : 'Install prompt and Add to Home Screen instructions are ready.')
                        : 'Prepared in the product layer so the future Expo build can plug in without redesigning the app.'}</p>
                    </article>
                  ))}
                </div>

                <StateCard
                  compact
                  tone="neutral"
                  icon="phone_iphone"
                  eyebrow="IPHONE FEEL"
                  title="The app should feel calm, quick and easy to return to"
                  body="Short loops, less clutter, visible wins and lighter animation help the interface stay usable every day."
                />

                <div className="sync-actions">
                  <button type="button" className="ghost-button" onClick={promptInstallApp}>
                    {isStandalone ? 'Installed on Home Screen' : installSupported ? 'Install Momentum' : 'Add to Home Screen guide'}
                  </button>
                </div>

                {deviceNotice ? <p className="notice-copy">{deviceNotice}</p> : null}

                <div className="profile-sheet-actions is-secondary">
                  <button type="button" className="ghost-danger" onClick={resetEverything}>Reset app</button>
                </div>
              </section>
            ) : null}

            {activeSettingsSection === 'about' ? (
              <section className="section-card">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">ABOUT US</span>
                    <h2>Why Momentum exists</h2>
                  </div>
                  <span className="metric-pill">Mission</span>
                </div>

                <StateCard
                  compact
                  tone="neutral"
                  icon="favorite"
                  eyebrow="MOMENTUM"
                  title="We want nutrition and habits to feel light, not punishing"
                  body="The product direction is simple: lower friction, calmer design, smarter food guidance and better consistency on iPhone."
                />

                <div className="insight-stack">
                  <article className="insight-line">
                    <strong>Less shame, more rhythm</strong>
                    <p>We optimize for return-friendly behaviour so missing a day never feels like failure.</p>
                  </article>

                  <article className="insight-line">
                    <strong>AI should reduce effort</strong>
                    <p>Camera, voice and natural language parsing should make food logging easier, not more technical.</p>
                  </article>

                  <article className="insight-line">
                    <strong>Mobile-first clarity</strong>
                    <p>Each screen is designed to feel focused on iPhone instead of cramming desktop ideas into a small display.</p>
                  </article>
                </div>
              </section>
            ) : null}

            {activeSettingsSection === 'subscriptions' ? (
              <section className="section-card">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">ПОДПИСКИ</span>
                    <h2>Pro layer</h2>
                  </div>
                  <span className="metric-pill">Coming next</span>
                </div>

                <StateCard
                  compact
                  tone="warm"
                  icon="workspace_premium"
                  eyebrow={isPro ? 'PRO ACTIVE' : 'FREE PLAN'}
                  title={isPro ? 'Momentum Pro preview is active' : 'Core tracking is already live'}
                  body={isPro
                    ? 'Advanced Smart Chef, stronger reminder layer and native-ready perks are now unlocked in this build.'
                    : 'Subscriptions unlock deeper AI nutrition, native Health sync, advanced insights and premium coaching loops.'}
                />

                <div className="pricing-grid">
                  {SUBSCRIPTION_PLANS.map((plan) => (
                    <article key={plan.id} className={['pricing-card', state.subscription.plan === plan.id ? 'is-active' : ''].filter(Boolean).join(' ')}>
                      <span className="eyebrow">{plan.label}</span>
                      <strong>{plan.price}</strong>
                      <p>{plan.note}</p>
                      <button
                        type="button"
                        className={state.subscription.plan === plan.id ? 'ghost-button' : 'primary-button'}
                        onClick={() => toggleSubscriptionPlan(plan.id)}
                      >
                        {state.subscription.plan === plan.id ? 'Current plan' : plan.id === 'pro' ? 'Start Pro preview' : 'Stay on Free'}
                      </button>
                    </article>
                  ))}
                </div>

                <div className="auth-mode-row">
                  <button
                    type="button"
                    className={['segment-button', state.subscription.billing === 'monthly' ? 'is-active' : ''].filter(Boolean).join(' ')}
                    onClick={() => toggleSubscriptionBilling('monthly')}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    className={['segment-button', state.subscription.billing === 'yearly' ? 'is-active' : ''].filter(Boolean).join(' ')}
                    onClick={() => toggleSubscriptionBilling('yearly')}
                  >
                    Yearly
                  </button>
                </div>

                <div className="insight-stack">
                  {PREMIUM_FEATURES.map((feature) => (
                    <article key={feature} className="insight-line">
                      <strong>{feature}</strong>
                      <p>{state.subscription.plan === 'pro'
                        ? 'Unlocked in the current build and ready to shape the product direction.'
                        : 'Reserved for the Pro layer so monetization has clear, meaningful value.'}</p>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </section>
        ) : null}

        {activeTab === 'insights' ? (
          <section className="tab-view">
            <section className="hero-panel">
              <div>
                <span className="eyebrow">ONE WEEK RHYTHM</span>
                <h2>Small wins, repeated often, beat perfect plans.</h2>
                <p>{nudgeText}</p>
              </div>

              <div className="hero-stats">
                <div className="hero-chip">
                  <span>Today</span>
                  <strong>{todayHabitCount}/{Math.max(totalHabits, 0)}</strong>
                </div>
                <div className="hero-chip">
                  <span>Average sleep</span>
                  <strong>{averageSleep ? averageSleep.toFixed(1) : '0.0'}h</strong>
                </div>
                <div className="hero-chip">
                  <span>Best streak</span>
                  <strong>{bestStreak}d</strong>
                </div>
              </div>
            </section>

            <section className="insight-grid">
              <article className="stat-card">
                <span className="eyebrow">WEEK SCORE</span>
                <strong>{weeklyCompletionAverage}%</strong>
                <p>Completion across the last 7 days.</p>
              </article>

              <article className="stat-card">
                <span className="eyebrow">BEST STREAK</span>
                <strong>{bestStreak}d</strong>
                <p>Your longest active run right now.</p>
              </article>

              <article className="stat-card">
                <span className="eyebrow">SLEEP HITS</span>
                <strong>{sleepTargetHitDays}/7</strong>
                <p>Days that reached your sleep target.</p>
              </article>

              <article className="stat-card">
                <span className="eyebrow">TOP HABIT</span>
                <strong>{topHabit ? topHabit.icon : '—'}</strong>
                <p>{topHabit ? topHabit.name : 'No leader yet'}</p>
              </article>
            </section>

            <section className="section-card">
              <div className="section-head">
                <div>
                  <span className="eyebrow">HABIT MAP</span>
                  <h2>Weekly completion by day</h2>
                </div>
                <span className="metric-pill">{totalHabits || 0} habits live</span>
              </div>

              <div className="chart-card habit-chart">
                {weeklyProgress.map((day) => {
                  const ratio = totalHabits ? (day.completed / totalHabits) * 100 : 0;

                  return (
                    <div key={day.key} className="chart-column">
                      <span className="chart-value">{day.completed}</span>
                      <div className="chart-bar-shell">
                        <div className="chart-bar is-habit" style={{ height: `${clamp(ratio, 8, 100)}%` }} />
                      </div>
                      <strong>{day.weekday}</strong>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="section-card">
              <div className="section-head">
                <div>
                  <span className="eyebrow">WHAT TO KEEP</span>
                  <h2>Return-friendly system</h2>
                </div>
                <span className="metric-pill">Psychology tuned</span>
              </div>

              <div className="insight-stack">
                <article className="insight-line">
                  <strong>7-day rhythm</strong>
                  <p>A weekly loop is short enough to restart fast and long enough to feel progress.</p>
                </article>

                <article className="insight-line">
                  <strong>One primary action</strong>
                  <p>The selected day and one-tap habit button reduce friction, which makes return more likely.</p>
                </article>

                <article className="insight-line">
                  <strong>Positive closure</strong>
                  <p>Sparks, streaks and short reflections reward completion without turning the app into guilt.</p>
                </article>
              </div>
            </section>
          </section>
        ) : null}
      </main>

      <nav className="bottom-nav">
        {TAB_ITEMS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={['tab-button', activeTab === tab.id ? 'is-active' : ''].filter(Boolean).join(' ')}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="material-symbols-outlined">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
