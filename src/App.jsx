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
  signInWithPassword,
  signUpWithPassword,
  signOutFromCloud,
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

function createDefaultState() {
  return {
    profile: { name: '', intention: '', onboardingComplete: false },
    habits: [],
    calories: { target: DEFAULT_CALORIE_TARGET, entries: {} },
    sleep: { target: DEFAULT_SLEEP_TARGET, entries: {} },
    journal: [],
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

function normalizeState(parsed) {
  const fallback = createDefaultState();
  const todayKey = formatDateKey(new Date());

  if (!parsed || typeof parsed !== 'object') return fallback;

  const calorieEntries = parsed?.calories?.entries && typeof parsed.calories.entries === 'object'
    ? parsed.calories.entries
    : {};

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
    habits,
    calories: { target: Number(parsed?.calories?.target) || DEFAULT_CALORIE_TARGET, entries: calorieEntries },
    sleep: {
      target: Number(parsed?.sleep?.target) || DEFAULT_SLEEP_TARGET,
      entries: parsed?.sleep?.entries && typeof parsed.sleep.entries === 'object' ? parsed.sleep.entries : {},
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

export default function App() {
  const [state, setState] = useState(() => loadState());
  const [activeTab, setActiveTab] = useState('habits');
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
  const [habitDraft, setHabitDraft] = useState(createHabitDraft());
  const photoInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const [captureState, setCaptureState] = useState({
    photoName: '',
    photoDataUrl: '',
    photoFile: null,
    voiceStatus: 'idle',
    voiceTranscript: '',
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
  const [cloudState, setCloudState] = useState({
    configured: isSupabaseConfigured,
    status: isSupabaseConfigured ? 'checking' : 'setup_required',
    session: null,
    user: null,
    profile: null,
    lastSyncedAt: '',
    error: '',
    isAuthenticating: false,
    isSavingProfile: false,
    isSyncing: false,
    isRestoring: false,
  });
  const [mealHistory, setMealHistory] = useState([]);
  const [mealHistoryState, setMealHistoryState] = useState({
    isLoading: false,
    error: '',
  });
  const [analysisState, setAnalysisState] = useState({
    status: 'idle',
    error: '',
    result: null,
  });
  const [isCloudBootstrapping, setIsCloudBootstrapping] = useState(false);
  const latestStateRef = useRef(state);

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
    setIsCloudBootstrapping(true);

    try {
      const profile = await fetchCloudProfile(user.id);

      setCloudState((previous) => ({
        ...previous,
        profile,
        error: '',
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
        }));
      } else {
        const synced = await pushCloudSnapshot(user.id, latestStateRef.current);
        setCloudState((previous) => ({
          ...previous,
          lastSyncedAt: synced?.updated_at || new Date().toISOString(),
          error: '',
        }));
      }

      await refreshMealHistory(user.id);
    } catch (error) {
      setCloudState((previous) => ({
        ...previous,
        status: 'error',
        error: error instanceof Error ? error.message : 'Cloud account could not be prepared.',
      }));
    } finally {
      setIsCloudBootstrapping(false);
    }
  });

  useEffect(() => {
    let isCancelled = false;

    async function hydrateCloud() {
      if (!isSupabaseConfigured) {
        setCloudState((previous) => ({ ...previous, status: 'setup_required' }));
        return;
      }

      try {
        const { session, user } = await getCloudSession();
        if (isCancelled) return;

        setCloudState((previous) => ({
          ...previous,
          session,
          user,
          status: user ? 'authenticated' : 'ready',
          profile: previous.profile,
          error: '',
        }));

        if (user?.email) {
          setAuthDraft((previous) => ({ ...previous, email: user.email }));
        }

        if (user) await bootstrapSignedInUser(user);
      } catch (error) {
        if (isCancelled) return;

        setCloudState((previous) => ({
          ...previous,
          status: 'error',
          error: error instanceof Error ? error.message : 'Cloud session could not be restored.',
        }));
      }
    }

    hydrateCloud();
    const unsubscribe = onCloudAuthChange(({ session, user }) => {
      if (isCancelled) return;

      setCloudState((previous) => ({
        ...previous,
        session,
        user,
        status: user ? 'authenticated' : 'ready',
        profile: user ? previous.profile : null,
        error: '',
      }));

      if (user?.email) {
        setAuthDraft((previous) => ({ ...previous, email: user.email }));
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

      bootstrapSignedInUser(user);
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
  const profileName = state.profile.name || cloudState.profile?.display_name || 'there';
  const isStandalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone);
  const voiceStatusLabel = {
    idle: 'Mic ready',
    listening: 'Listening',
    captured: 'Voice captured',
    unavailable: 'Native mic later',
    error: 'Mic blocked',
  }[captureState.voiceStatus];
  const cloudUserEmail = cloudState.user?.email || authDraft.email;
  const cloudStatusLabel = cloudState.user
    ? 'Cloud live'
    : cloudState.configured
      ? 'Ready to connect'
      : 'Setup needed';
  const cloudStatusText = cloudState.lastSyncedAt
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

  function adjustCalories(delta) {
    updateCalories(String(Math.max(0, selectedCalories + delta)));
  }

  function openPhotoPicker() {
    photoInputRef.current?.click();
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

  async function handlePasswordAuth(mode) {
    const email = authDraft.email.trim();
    const password = authDraft.password;

    if (!email || !password) {
      setCloudState((previous) => ({ ...previous, error: 'Enter both email and password first.' }));
      return;
    }

    if (mode === 'signup' && !authDraft.displayName.trim()) {
      setCloudState((previous) => ({ ...previous, error: 'Add your name so the profile feels personal from day one.' }));
      return;
    }

    setCloudState((previous) => ({ ...previous, isAuthenticating: true, error: '' }));

    try {
      if (mode === 'signup') {
        const data = await signUpWithPassword({
          email,
          password,
          displayName: authDraft.displayName.trim(),
        });

        if (!data.session && data.user) {
          setCloudState((previous) => ({
            ...previous,
            isAuthenticating: false,
            status: 'ready',
            error: 'Account created. If Supabase asks for email confirmation, confirm once and then sign in.',
          }));
          return;
        }
      } else {
        await signInWithPassword({ email, password });
      }

      setCloudState((previous) => ({
        ...previous,
        isAuthenticating: false,
        status: 'authenticated',
        error: '',
      }));
    } catch (error) {
      setCloudState((previous) => ({
        ...previous,
        isAuthenticating: false,
        status: 'error',
        error: error instanceof Error ? error.message : 'Account auth failed.',
      }));
    }
  }

  async function syncSnapshotToCloud({ silent = false } = {}) {
    if (!cloudState.user) {
      if (!silent) {
        setCloudState((previous) => ({ ...previous, error: 'Connect your email first, then cloud backup will unlock.' }));
      }
      return;
    }

    setCloudState((previous) => ({ ...previous, isSyncing: true, error: '' }));

    try {
      const synced = await pushCloudSnapshot(cloudState.user.id, state);
      setCloudState((previous) => ({
        ...previous,
        isSyncing: false,
        lastSyncedAt: synced?.updated_at || new Date().toISOString(),
        error: '',
      }));
    } catch (error) {
      setCloudState((previous) => ({
        ...previous,
        isSyncing: false,
        status: 'error',
        error: error instanceof Error ? error.message : 'Cloud sync failed.',
      }));
    }
  }

  async function restoreSnapshotFromCloud() {
    if (!cloudState.user) {
      setCloudState((previous) => ({ ...previous, error: 'Sign in first so I can restore your backup.' }));
      return;
    }

    setCloudState((previous) => ({ ...previous, isRestoring: true, error: '' }));

    try {
      const snapshot = await pullCloudSnapshot(cloudState.user.id);

      if (!snapshot?.payload) {
        setCloudState((previous) => ({
          ...previous,
          isRestoring: false,
          error: 'No backup exists in Supabase yet.',
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
      }));
    } catch (error) {
      setCloudState((previous) => ({
        ...previous,
        isRestoring: false,
        status: 'error',
        error: error instanceof Error ? error.message : 'Cloud restore failed.',
      }));
    }
  }

  async function disconnectCloud() {
    try {
      await signOutFromCloud();
      setMealHistory([]);
      setMealHistoryState({ isLoading: false, error: '' });
      setAuthDraft((previous) => ({ ...previous, password: '' }));
      setCloudState((previous) => ({
        ...previous,
        session: null,
        user: null,
        profile: null,
        status: 'ready',
        error: '',
      }));
    } catch (error) {
      setCloudState((previous) => ({
        ...previous,
        status: 'error',
        error: error instanceof Error ? error.message : 'Cloud sign out failed.',
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

    setCloudState((previous) => ({ ...previous, isSavingProfile: true, error: '' }));

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
      }));
    } catch (error) {
      setCloudState((previous) => ({
        ...previous,
        isSavingProfile: false,
        status: 'error',
        error: error instanceof Error ? error.message : 'Profile could not be saved.',
      }));
    }
  }

  async function runMealAnalysis() {
    if (!captureState.photoDataUrl && !captureState.voiceTranscript.trim()) {
      setAnalysisState({
        status: 'error',
        error: 'Capture a meal photo or dictate a meal first.',
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
        source: captureState.lastSource || (captureState.photoDataUrl ? 'photo' : 'voice'),
        transcript: captureState.voiceTranscript.trim(),
        imageDataUrl: captureState.photoDataUrl || undefined,
        imageName: captureState.photoName || undefined,
        storagePath,
        locale: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
        dateKey: selectedDateKey,
      });

      if (result.status !== 'ok') {
        setAnalysisState({
          status: result.status || 'error',
          error: result.message || 'Meal analysis is not configured yet.',
          result: null,
        });
        return;
      }

      setAnalysisState({ status: 'complete', error: '', result });

      if (result.totalCalories) {
        setState((previous) => {
          const currentValue = Number(previous.calories.entries?.[selectedDateKey]) || 0;
          return {
            ...previous,
            calories: {
              ...previous.calories,
              entries: {
                ...previous.calories.entries,
                [selectedDateKey]: clamp(currentValue + result.totalCalories, 0, 10000),
              },
            },
          };
        });
      }

      setCaptureState((previous) => ({
        ...previous,
        providerHint: result.totalCalories
          ? `${result.totalCalories} kcal added to ${selectedDayLabel.toLowerCase()}.`
          : 'Meal parsed. Add a nutrition provider for calorie estimates.',
      }));

      if (cloudState.user) {
        await refreshMealHistory(cloudState.user.id);
      }
    } catch (error) {
      setAnalysisState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Meal analysis failed.',
        result: null,
      });
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
    setJournalDraft('');
  }
  const selectedDayLabel = selectedDay?.isToday
    ? 'Today'
    : formatShortDate(selectedDay.iso, { weekday: 'long', day: 'numeric', month: 'short' });
  const sleepProgress = clamp(((Number(state.sleep.entries?.[selectedDateKey]) || 0) / (Number(state.sleep.target) || DEFAULT_SLEEP_TARGET)) * 100, 0, 100);

  return (
    <div className="app-shell">
      <SparkLayer bursts={bursts} />

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

      <main className="app-frame">
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
                  <div className="empty-card">
                    <strong>No habits yet</strong>
                    <p>Start with one or two. The goal is a daily return, not a huge list.</p>
                  </div>
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
                  <div className="empty-card compact">
                    <strong>No archive yet</strong>
                    <p>Your notes for each day will appear here.</p>
                  </div>
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
                  <h3>Consistency beats precision</h3>
                  <p>Log a rough number in under 10 seconds and keep moving.</p>

                  <label className="field">
                    <span>Calories for selected day</span>
                    <input type="number" min="0" step="10" value={selectedCalories || ''} onChange={(event) => updateCalories(event.target.value)} placeholder="0" />
                  </label>

                  <label className="field">
                    <span>Daily target</span>
                    <input type="number" min="1200" max="5000" step="10" value={state.calories.target} onChange={(event) => updateCalorieTarget(event.target.value)} />
                  </label>
                </div>
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
                  <span className="eyebrow">CAPTURE LANE</span>
                  <h2>Photo or voice logging</h2>
                </div>
                <span className="metric-pill">iPhone-ready flow</span>
              </div>

              <div className="capture-grid">
                {CALORIE_CAPTURE_MODES.map((mode) => {
                  const isVoice = mode.id === 'voice';
                  const isActive = captureState.lastSource === mode.id;

                  return (
                    <button
                      key={mode.id}
                      type="button"
                      className={['capture-card', isActive ? 'is-active' : ''].filter(Boolean).join(' ')}
                      onClick={isVoice ? startVoiceCapture : openPhotoPicker}
                    >
                      <span className="capture-icon material-symbols-outlined">{mode.icon}</span>
                      <strong>{mode.title}</strong>
                      <p>{mode.body}</p>
                      <small>{isVoice ? voiceStatusLabel : captureState.photoName ? 'Photo ready' : 'Camera ready'}</small>
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
                  <strong>Prepared for real calorie recognition</strong>
                  <span>{captureState.lastSource ? `Source: ${captureState.lastSource}` : 'Awaiting capture'}</span>
                </div>

                <div className="capture-status-line">
                  <span className="material-symbols-outlined">imagesmode</span>
                  <p>{captureState.photoName ? `Latest photo: ${captureState.photoName}` : 'Meal photo will open the iPhone camera or photo picker.'}</p>
                </div>

                <div className="capture-status-line">
                  <span className="material-symbols-outlined">graphic_eq</span>
                  <p>{captureState.voiceTranscript || 'Voice meal text will appear here after transcription.'}</p>
                </div>

                <p className="capture-note">{captureState.providerHint}</p>
              </div>

              <div className="provider-grid">
                <span className="provider-pill">OpenAI vision / parsing</span>
                <span className="provider-pill">Supabase edge function</span>
                <span className="provider-pill">Nutrition API layer</span>
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

              {analysisState.status !== 'idle' ? (
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

                  {analysisState.error ? (
                    <p className="analysis-error">{analysisState.error}</p>
                  ) : null}

                  {analysisState.result ? (
                    <>
                      <div className="analysis-total">
                        <strong>{analysisState.result.totalCalories ?? '—'}</strong>
                        <span>estimated kcal</span>
                      </div>

                      <div className="analysis-food-list">
                        {analysisState.result.foods?.map((food, index) => (
                          <article key={`${food.name}-${index}`} className="analysis-food">
                            <strong>{food.name}</strong>
                            <span>{food.quantityText || 'Serving pending'}</span>
                            <small>{Number.isFinite(food.calories) ? `${food.calories} kcal` : 'Needs nutrition provider'}</small>
                          </article>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              <div className="capture-flow">
                <div className="capture-flow-step">
                  <span>1</span>
                  <p>Capture one meal by camera or microphone.</p>
                </div>
                <div className="capture-flow-step">
                  <span>2</span>
                  <p>Run vision or transcription, then map items to a nutrition provider.</p>
                </div>
                <div className="capture-flow-step">
                  <span>3</span>
                  <p>Let the user confirm serving sizes before calories are saved.</p>
                </div>
              </div>
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
                <div className="empty-card">
                  <strong>Sign in to build meal history</strong>
                  <p>Each AI capture will save here with calories, foods, and photo previews tied to your account.</p>
                </div>
              ) : mealHistoryState.isLoading ? (
                <div className="empty-card">
                  <strong>Loading meals</strong>
                  <p>Pulling your recent captures from Supabase.</p>
                </div>
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
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-card">
                  <strong>No meals saved yet</strong>
                  <p>Your first photo or voice meal capture will come back here as a reusable food history.</p>
                </div>
              )}

              {mealHistoryState.error ? <p className="analysis-error">{mealHistoryState.error}</p> : null}
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

        {activeTab === 'insights' ? (
          <section className="tab-view">
            <header className="top-bar">
              <div className="brand-block">
                <div className="avatar-badge">{(profileName[0] || 'M').toUpperCase()}</div>
                <div>
                  <span className="eyebrow">{getGreeting()}</span>
                  <h1>{profileName}</h1>
                </div>
              </div>

              <div className="streak-pill">
                <span className="material-symbols-outlined">local_fire_department</span>
                <strong>{bestStreak}</strong>
              </div>
            </header>

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
                  <span className="eyebrow">ACCOUNT</span>
                  <h2>Identity, sync, profile</h2>
                </div>
                <span className="status-badge">{cloudStatusLabel}</span>
              </div>

              <div className="sync-shell">
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
                        type="password"
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
                        className="primary-button"
                        onClick={() => handlePasswordAuth(authDraft.mode)}
                        disabled={!cloudState.configured || cloudState.isAuthenticating}
                      >
                        {cloudState.isAuthenticating
                          ? authDraft.mode === 'signup' ? 'Creating account...' : 'Signing in...'
                          : authDraft.mode === 'signup' ? 'Create account' : 'Sign in'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="account-summary-card">
                      <div>
                        <span className="eyebrow">SIGNED IN</span>
                        <h3>{accountDraft.displayName || cloudState.profile?.display_name || profileName}</h3>
                        <p>{cloudUserEmail}</p>
                      </div>
                      <span className="metric-pill">{cloudStatusText}</span>
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

                {cloudState.error ? <p className="analysis-error">{cloudState.error}</p> : null}
              </div>
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

        <button type="button" className="reset-link" onClick={resetEverything}>Reset app</button>
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
