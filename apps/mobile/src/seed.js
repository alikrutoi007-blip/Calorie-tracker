export const MOBILE_TABS = [
  { id: 'habits', label: 'Habits', icon: 'check_circle' },
  { id: 'calories', label: 'Calories', icon: 'restaurant' },
  { id: 'insights', label: 'Insights', icon: 'insights' },
  { id: 'settings', label: 'Settings', icon: 'tune' },
]

export const SETTINGS_SECTIONS = [
  { id: 'notifications', label: 'Notifications' },
  { id: 'account', label: 'Account' },
  { id: 'app', label: 'App' },
  { id: 'about', label: 'About us' },
  { id: 'subscriptions', label: 'Subscriptions' },
]

export const PREMIUM_FEATURES = [
  'Adaptive meal confirmation',
  'Smart Chef close-the-day suggestions',
  'Push timing tuned by rhythm',
  'HealthKit and deeper iPhone integrations',
]

function isoDay(offset) {
  const next = new Date()
  next.setDate(next.getDate() + offset)
  return next.toISOString().slice(0, 10)
}

export function createMobileSeedState() {
  const today = isoDay(0)

  return {
    profile: {
      name: 'there',
      intention: 'Calm energy, tighter nutrition, and a return-friendly rhythm.',
      email: 'you@example.com',
    },
    subscription: {
      plan: 'free',
      billing: 'monthly',
    },
    reminders: {
      pushReminders: false,
      morningCheckIn: true,
      eveningCheckIn: true,
      morningHour: 9,
      eveningHour: 20,
      checkins: {
        [today]: {
          morning: false,
          evening: true,
        },
      },
    },
    habits: [
      { id: 'water', name: 'Drink water', cue: '2 liters by evening', streak: 8, done: true },
      { id: 'move', name: 'Training', cue: 'At least 30 minutes', streak: 3, done: false },
      { id: 'sleep', name: 'Sleep before midnight', cue: 'Protect recovery', streak: 5, done: false },
    ],
    sleep: {
      target: 8,
      today: 6.5,
    },
    calories: {
      target: 2200,
      consumed: 1680,
      proteinTarget: 140,
      macros: { protein: 102, fat: 55, carbs: 148 },
      analysis: {
        summary: 'Chicken rice bowl with sweet tea',
        totalCalories: 620,
        totalMacros: { protein: 39, fat: 17, carbs: 67 },
        foods: [
          { id: 'a', name: 'Chicken thigh', quantity: '180 g', calories: 310, protein: 34, fat: 16, carbs: 0 },
          { id: 'b', name: 'Rice', quantity: '220 g', calories: 250, protein: 5, fat: 1, carbs: 52 },
          { id: 'c', name: 'Sweet tea', quantity: '250 ml', calories: 60, protein: 0, fat: 0, carbs: 15 },
        ],
        glycemicNote: 'Tea plus rice may spike energy and then dip it. Add fiber or keep the next meal lighter.',
        energyForecast: 'Expect a short boost, then a softer energy drop in about 40-60 minutes.',
      },
      favorites: [
        { id: 'fav-1', title: 'Greek yogurt bowl', calories: 380, macros: { protein: 28, fat: 12, carbs: 30 } },
        { id: 'fav-2', title: 'Chicken rice lunch', calories: 610, macros: { protein: 39, fat: 15, carbs: 67 } },
      ],
      recent: [
        { id: 'rec-1', title: 'Salmon dinner', calories: 540, macros: { protein: 42, fat: 24, carbs: 28 } },
        { id: 'rec-2', title: 'Egg and toast breakfast', calories: 410, macros: { protein: 24, fat: 18, carbs: 32 } },
      ],
      smartChef: [
        'Protein rescue bowl: greek yogurt, berries and a handful of nuts.',
        'Light finish: eggs plus cucumber if you want satiety without overshooting calories.',
        'Balanced close: chicken, rice and greens if the day is still low on carbs and protein.',
      ],
    },
    insights: {
      weekScore: 74,
      averageSleep: 6.8,
      bestStreak: 12,
      sleepHits: 3,
    },
  }
}
