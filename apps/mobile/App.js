import React, { useEffect, useState } from 'react'
import { Alert, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { StatusBar as ExpoStatusBar } from 'expo-status-bar'
import { analyzeMealWithEdgePreview } from './src/services/cameraNutrition'
import { connectHealthkitPreview, getHealthkitSnapshotPreview } from './src/services/healthkit'
import { requestMomentumNotifications, scheduleMomentumReminderPair } from './src/services/notifications'
import { getSubscriptionPreview, startSubscriptionCheckoutPreview } from './src/services/subscriptions'
import { getMobileCloudPreview } from './src/services/supabase'
import { MOBILE_TABS, SETTINGS_SECTIONS, PREMIUM_FEATURES, createMobileSeedState } from './src/seed'
import { THEME } from './src/theme'

function Card({ eyebrow, title, right, children }) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
        {right}
      </View>
      {children}
    </View>
  )
}

function Button({ label, onPress, ghost }) {
  return (
    <Pressable style={[styles.button, ghost ? styles.buttonGhost : styles.buttonPrimary]} onPress={onPress}>
      <Text style={[styles.buttonLabel, ghost ? styles.buttonLabelGhost : styles.buttonLabelPrimary]}>{label}</Text>
    </Pressable>
  )
}

function Pill({ children, accent }) {
  return (
    <View style={[styles.pill, accent ? styles.pillAccent : null]}>
      <Text style={[styles.pillText, accent ? styles.pillTextAccent : null]}>{children}</Text>
    </View>
  )
}

export default function App() {
  const seed = createMobileSeedState()
  const [tab, setTab] = useState('habits')
  const [settingsSection, setSettingsSection] = useState('notifications')
  const [state, setState] = useState(seed)
  const [mealText, setMealText] = useState('Chicken rice bowl, sweet tea, one spoon of oil')
  const [analysis, setAnalysis] = useState(seed.calories.analysis)
  const [serviceState, setServiceState] = useState({
    notifications: 'Permission not requested yet',
    health: 'HealthKit not connected yet',
    subscriptions: 'RevenueCat not configured yet',
    cloud: 'Supabase mobile env not configured yet',
  })

  useEffect(() => {
    let mounted = true

    async function bootstrap() {
      const cloud = await getMobileCloudPreview()
      const subscription = await getSubscriptionPreview()
      const health = await getHealthkitSnapshotPreview()

      if (!mounted) return

      setServiceState((previous) => ({
        ...previous,
        cloud: cloud.configured ? 'Supabase mobile sync is configured.' : previous.cloud,
        subscriptions: subscription.configured ? 'RevenueCat keys are present.' : previous.subscriptions,
        health: health.source === 'preview' ? 'HealthKit preview lane is ready for iPhone.' : previous.health,
      }))
    }

    bootstrap()
    return () => {
      mounted = false
    }
  }, [])

  const todayKey = new Date().toISOString().slice(0, 10)
  const checkins = state.reminders.checkins[todayKey] || { morning: false, evening: false }
  const smartChef = state.subscription.plan === 'pro' ? state.calories.smartChef : state.calories.smartChef.slice(0, 1)

  function patchState(updater) {
    setState((previous) => updater(previous))
  }

  function toggleHabit(id) {
    patchState((previous) => ({
      ...previous,
      habits: previous.habits.map((habit) => habit.id === id ? { ...habit, done: !habit.done } : habit),
    }))
  }

  function toggleCheckin(key) {
    patchState((previous) => ({
      ...previous,
      reminders: {
        ...previous.reminders,
        checkins: {
          ...previous.reminders.checkins,
          [todayKey]: {
            ...checkins,
            [key]: !checkins[key],
          },
        },
      },
    }))
  }

  function toggleReminder(key) {
    patchState((previous) => ({
      ...previous,
      reminders: {
        ...previous.reminders,
        [key]: !previous.reminders[key],
      },
    }))
  }

  function updateReminderHour(key, value) {
    patchState((previous) => ({
      ...previous,
      reminders: {
        ...previous.reminders,
        [key]: Number(value) || previous.reminders[key],
      },
    }))
  }

  async function enableNotifications() {
    const result = await requestMomentumNotifications()
    setServiceState((previous) => ({ ...previous, notifications: result.message }))
    if (result.ok) {
      await scheduleMomentumReminderPair({
        morningHour: state.reminders.morningHour,
        eveningHour: state.reminders.eveningHour,
      })
      toggleReminder('pushReminders')
    }
    Alert.alert('Notifications', result.message)
  }

  async function connectHealth() {
    const result = await connectHealthkitPreview()
    setServiceState((previous) => ({ ...previous, health: result.message }))
    Alert.alert('HealthKit', result.message)
  }

  async function analyzeMeal() {
    const result = await analyzeMealWithEdgePreview({ source: 'manual', transcript: mealText })
    setAnalysis({
      summary: result.summary,
      totalCalories: result.totalCalories,
      totalMacros: result.totalMacros,
      foods: result.foods.map((food, index) => ({
        id: food.id || `${food.name}-${index}`,
        name: food.name,
        quantity: food.quantity || food.quantityText || '1 serving',
        calories: food.calories || 0,
        protein: food.protein || 0,
        fat: food.fat || 0,
        carbs: food.carbs || 0,
      })),
      glycemicNote: result.glycemicNote,
      energyForecast: result.energyForecast,
    })
    Alert.alert('Meal analyzed', result.message || 'Review and confirm the meal before saving it.')
  }

  function updateFood(index, field, value) {
    setAnalysis((previous) => {
      const foods = previous.foods.map((food, foodIndex) => (
        foodIndex === index
          ? { ...food, [field]: ['calories', 'protein', 'fat', 'carbs'].includes(field) ? Number(value) || 0 : value }
          : food
      ))

      return {
        ...previous,
        foods,
        totalCalories: foods.reduce((sum, food) => sum + (food.calories || 0), 0),
        totalMacros: {
          protein: foods.reduce((sum, food) => sum + (food.protein || 0), 0),
          fat: foods.reduce((sum, food) => sum + (food.fat || 0), 0),
          carbs: foods.reduce((sum, food) => sum + (food.carbs || 0), 0),
        },
      }
    })
  }

  function saveFavorite() {
    patchState((previous) => ({
      ...previous,
      calories: {
        ...previous.calories,
        favorites: [
          {
            id: `fav-${Date.now()}`,
            title: analysis.summary,
            calories: analysis.totalCalories || 0,
            macros: analysis.totalMacros,
          },
          ...previous.calories.favorites,
        ].slice(0, 8),
      },
    }))
    Alert.alert('Saved', 'This meal is now available in favorites.')
  }

  function applyMeal(meal) {
    patchState((previous) => ({
      ...previous,
      calories: {
        ...previous.calories,
        consumed: previous.calories.consumed + meal.calories,
        macros: {
          protein: previous.calories.macros.protein + meal.macros.protein,
          fat: previous.calories.macros.fat + meal.macros.fat,
          carbs: previous.calories.macros.carbs + meal.macros.carbs,
        },
        recent: [
          {
            id: `recent-${Date.now()}`,
            title: meal.title,
            calories: meal.calories,
            macros: meal.macros,
          },
          ...previous.calories.recent,
        ].slice(0, 8),
      },
    }))
    Alert.alert('Added', `${meal.title} was applied to today.`)
  }

  function applyAnalysis() {
    applyMeal({
      title: analysis.summary,
      calories: analysis.totalCalories || 0,
      macros: analysis.totalMacros || { protein: 0, fat: 0, carbs: 0 },
    })
  }

  async function openCheckout() {
    const result = await startSubscriptionCheckoutPreview()
    setServiceState((previous) => ({ ...previous, subscriptions: result.message }))
    Alert.alert('Subscriptions', result.message)
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ExpoStatusBar style="dark" />
      <StatusBar barStyle="dark-content" />
      <View style={styles.container}>
        <View style={styles.topBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>MOMENTUM MOBILE</Text>
            <Text style={styles.screenTitle}>{MOBILE_TABS.find((item) => item.id === tab)?.label}</Text>
            <Text style={styles.copy}>{state.profile.intention}</Text>
          </View>
          <Pill accent>{state.subscription.plan === 'pro' ? 'Pro' : 'Free'}</Pill>
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {tab === 'habits' ? (
            <>
              <Card eyebrow="RETURN LOOP" title="Daily check-ins" right={<Pill accent>{Number(checkins.morning) + Number(checkins.evening)}/2 done</Pill>}>
                {[
                  { id: 'morning', title: 'Morning check-in', body: 'Open the day with one tiny intentional action.' },
                  { id: 'evening', title: 'Evening closure', body: 'Close the day softly with one note or one meal log.' },
                ].map((item) => (
                  <View key={item.id} style={[styles.softCard, checkins[item.id] ? styles.successCard : null]}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.itemBody}>{item.body}</Text>
                    <Button label={checkins[item.id] ? 'Done' : 'Check in'} onPress={() => toggleCheckin(item.id)} ghost={checkins[item.id]} />
                  </View>
                ))}
              </Card>

              <Card eyebrow="TODAY" title="Habit rhythm" right={<Pill>{state.habits.filter((habit) => habit.done).length}/{state.habits.length} done</Pill>}>
                {state.habits.map((habit) => (
                  <Pressable key={habit.id} style={[styles.listRow, habit.done ? styles.listRowDone : null]} onPress={() => toggleHabit(habit.id)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{habit.name}</Text>
                      <Text style={styles.itemBody}>{habit.cue}</Text>
                    </View>
                    <Pill>{habit.done ? 'closed' : 'open'}</Pill>
                  </Pressable>
                ))}
              </Card>

              <Card eyebrow="RECOVERY" title="Sleep and HealthKit" right={<Pill>{state.sleep.today}h / {state.sleep.target}h</Pill>}>
                <Text style={styles.copy}>The native app is ready for an iPhone HealthKit lane so manual sleep can later become real sync.</Text>
                <Button label="Connect HealthKit preview" onPress={connectHealth} ghost />
              </Card>
            </>
          ) : null}

          {tab === 'calories' ? (
            <>
              <Card eyebrow="FUEL CHECK" title="Calorie trust layer" right={<Pill accent>{state.calories.target - state.calories.consumed} left</Pill>}>
                <View style={styles.metricRow}>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>Consumed</Text>
                    <Text style={styles.metricValue}>{state.calories.consumed} kcal</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>Protein</Text>
                    <Text style={styles.metricValue}>{state.calories.macros.protein} g</Text>
                  </View>
                </View>
                <Text style={styles.copy}>Native calorie logging is built around camera, mic and confirmation so the numbers stay editable and trustworthy.</Text>
              </Card>

              <Card eyebrow="CAPTURE" title="Photo + voice + natural language" right={<Pill>Native scaffold</Pill>}>
                <TextInput
                  style={styles.input}
                  value={mealText}
                  onChangeText={setMealText}
                  placeholder="Chicken rice bowl, sweet tea, one spoon of oil"
                  placeholderTextColor={THEME.muted}
                />
                <View style={styles.buttonRow}>
                  <Button label="Analyze meal" onPress={analyzeMeal} />
                  <Button label="Save favorite" onPress={saveFavorite} ghost />
                </View>
              </Card>

              <Card eyebrow="CONFIRM" title={analysis.summary} right={<Pill accent>{analysis.totalCalories || 0} kcal</Pill>}>
                {(analysis.foods || []).map((food, index) => (
                  <View key={food.id || index} style={styles.editorCard}>
                    <TextInput style={styles.input} value={food.name} onChangeText={(value) => updateFood(index, 'name', value)} />
                    <TextInput style={styles.input} value={food.quantity} onChangeText={(value) => updateFood(index, 'quantity', value)} />
                    <View style={styles.editorGrid}>
                      {[
                        ['calories', 'Kcal'],
                        ['protein', 'P'],
                        ['fat', 'F'],
                        ['carbs', 'C'],
                      ].map(([key, label]) => (
                        <View key={key} style={styles.miniField}>
                          <Text style={styles.miniLabel}>{label}</Text>
                          <TextInput
                            style={styles.miniInput}
                            keyboardType="numeric"
                            value={String(food[key] || 0)}
                            onChangeText={(value) => updateFood(index, key, value)}
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
                <Text style={styles.itemBody}>{analysis.glycemicNote}</Text>
                <Text style={styles.itemBody}>{analysis.energyForecast}</Text>
                <View style={styles.buttonRow}>
                  <Button label="Apply to today" onPress={applyAnalysis} />
                  <Button label="Save favorite" onPress={saveFavorite} ghost />
                </View>
              </Card>

              <Card eyebrow="SMART CHEF" title="Close the day well" right={<Pill>{state.subscription.plan === 'pro' ? 'Pro' : 'Preview'}</Pill>}>
                {smartChef.map((item) => (
                  <View key={item} style={styles.softCard}>
                    <Text style={styles.itemTitle}>{item}</Text>
                  </View>
                ))}
              </Card>

              <Card eyebrow="SAVE TIME" title="Favorites and recent meals" right={<Pill>{state.calories.favorites.length} favorites</Pill>}>
                {[...state.calories.favorites, ...state.calories.recent].map((meal) => (
                  <Pressable key={meal.id} style={styles.softCard} onPress={() => applyMeal(meal)}>
                    <Text style={styles.itemTitle}>{meal.title}</Text>
                    <Text style={styles.itemBody}>{meal.calories} kcal</Text>
                    <Text style={styles.itemBody}>P {meal.macros.protein} / F {meal.macros.fat} / C {meal.macros.carbs}</Text>
                  </Pressable>
                ))}
              </Card>
            </>
          ) : null}

          {tab === 'insights' ? (
            <>
              <Card eyebrow="MOMENTUM SCORE" title="Weekly signal" right={<Pill accent>{state.insights.weekScore}/100</Pill>}>
                <View style={styles.metricRow}>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>Best streak</Text>
                    <Text style={styles.metricValue}>{state.insights.bestStreak} days</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>Sleep hits</Text>
                    <Text style={styles.metricValue}>{state.insights.sleepHits}/7</Text>
                  </View>
                </View>
                <Text style={styles.copy}>The native layer is focused on daily return loops first, then deeper biofeedback once HealthKit is live.</Text>
              </Card>

              <Card eyebrow="SERVICES" title="App Store infrastructure" right={<Pill>Preview lane</Pill>}>
                {[
                  ['Cloud sync', serviceState.cloud],
                  ['Push reminders', serviceState.notifications],
                  ['HealthKit', serviceState.health],
                  ['Subscriptions', serviceState.subscriptions],
                ].map(([label, body]) => (
                  <View key={label} style={styles.softCard}>
                    <Text style={styles.itemTitle}>{label}</Text>
                    <Text style={styles.itemBody}>{body}</Text>
                  </View>
                ))}
              </Card>

              <Card eyebrow="MONETIZATION" title="Premium structure" right={<Pill accent>{state.subscription.plan}</Pill>}>
                {PREMIUM_FEATURES.map((feature) => (
                  <View key={feature} style={styles.listRow}>
                    <Text style={styles.itemBody}>{feature}</Text>
                  </View>
                ))}
                <View style={styles.buttonRow}>
                  <Button label="Start Pro checkout" onPress={openCheckout} />
                  <Button
                    label="Switch preview plan"
                    onPress={() => patchState((previous) => ({
                      ...previous,
                      subscription: {
                        ...previous.subscription,
                        plan: previous.subscription.plan === 'pro' ? 'free' : 'pro',
                      },
                    }))}
                    ghost
                  />
                </View>
              </Card>
            </>
          ) : null}

          {tab === 'settings' ? (
            <>
              <Card eyebrow="PROFILE" title={state.profile.name} right={<Pill>{state.profile.email}</Pill>}>
                <Text style={styles.copy}>{state.profile.intention}</Text>
              </Card>

              <View style={styles.segmentRow}>
                {SETTINGS_SECTIONS.map((section) => (
                  <Pressable
                    key={section.id}
                    style={[styles.segment, settingsSection === section.id ? styles.segmentActive : null]}
                    onPress={() => setSettingsSection(section.id)}
                  >
                    <Text style={[styles.segmentText, settingsSection === section.id ? styles.segmentTextActive : null]}>
                      {section.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {settingsSection === 'notifications' ? (
                <Card eyebrow="RETENTION" title="Notifications">
                  <View style={styles.listRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>Push reminders</Text>
                      <Text style={styles.itemBody}>Morning and evening return nudges that feel gentle on iPhone.</Text>
                    </View>
                    <Switch value={state.reminders.pushReminders} onValueChange={enableNotifications} />
                  </View>
                  <View style={styles.metricRow}>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>Morning</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(state.reminders.morningHour)}
                        onChangeText={(value) => updateReminderHour('morningHour', value)}
                      />
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>Evening</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(state.reminders.eveningHour)}
                        onChangeText={(value) => updateReminderHour('eveningHour', value)}
                      />
                    </View>
                  </View>
                </Card>
              ) : null}

              {settingsSection === 'account' ? (
                <Card eyebrow="ACCOUNT" title="Cloud identity">
                  <View style={styles.softCard}>
                    <Text style={styles.itemTitle}>Supabase account sync</Text>
                    <Text style={styles.itemBody}>Sign in, sync habits and calories, then restore them across devices.</Text>
                  </View>
                  <View style={styles.softCard}>
                    <Text style={styles.itemTitle}>Email + password</Text>
                    <Text style={styles.itemBody}>The web app already has the auth flow. The native layer is prepared to reuse the same backend.</Text>
                  </View>
                </Card>
              ) : null}

              {settingsSection === 'app' ? (
                <Card eyebrow="APP" title="Momentum preferences">
                  <View style={styles.listRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>Morning check-in lane</Text>
                      <Text style={styles.itemBody}>Keep the start small so the app feels easy to return to.</Text>
                    </View>
                    <Switch value={state.reminders.morningCheckIn} onValueChange={() => toggleReminder('morningCheckIn')} />
                  </View>
                  <View style={styles.listRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>Evening closure lane</Text>
                      <Text style={styles.itemBody}>Prompt one reflection or one meal confirmation before sleep.</Text>
                    </View>
                    <Switch value={state.reminders.eveningCheckIn} onValueChange={() => toggleReminder('eveningCheckIn')} />
                  </View>
                </Card>
              ) : null}

              {settingsSection === 'about' ? (
                <Card eyebrow="ABOUT" title="What ships next">
                  {[
                    'Expo dev build for real iPhone camera, mic and notifications.',
                    'HealthKit sync for sleep and calorie intake.',
                    'RevenueCat products wired to App Store subscriptions.',
                    'Native onboarding that keeps the product emotionally lightweight.',
                  ].map((item) => (
                    <View key={item} style={styles.listRow}>
                      <Text style={styles.itemBody}>{item}</Text>
                    </View>
                  ))}
                </Card>
              ) : null}

              {settingsSection === 'subscriptions' ? (
                <Card eyebrow="SUBSCRIPTIONS" title="Free vs Pro">
                  <View style={styles.softCard}>
                    <Text style={styles.itemTitle}>Current plan: {state.subscription.plan}</Text>
                    <Text style={styles.itemBody}>Use Free for the daily loop, unlock Pro for smarter nutrition coaching and deeper device integrations.</Text>
                  </View>
                  <Button label="Open RevenueCat preview" onPress={openCheckout} />
                </Card>
              ) : null}
            </>
          ) : null}
        </ScrollView>

        <View style={styles.tabBar}>
          {MOBILE_TABS.map((item) => (
            <Pressable key={item.id} style={[styles.tabItem, tab === item.id ? styles.tabItemActive : null]} onPress={() => setTab(item.id)}>
              <Text style={[styles.tabLabel, tab === item.id ? styles.tabLabelActive : null]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  topBar: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: THEME.ink,
    marginTop: 4,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: THEME.muted,
    fontWeight: '700',
  },
  copy: {
    fontSize: 14,
    lineHeight: 20,
    color: THEME.muted,
    marginTop: 6,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    gap: 18,
  },
  card: {
    backgroundColor: THEME.card,
    borderRadius: 28,
    padding: 18,
    gap: 16,
    shadowColor: THEME.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 4,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  title: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
    color: THEME.ink,
    marginTop: 4,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: THEME.surface,
    alignSelf: 'flex-start',
  },
  pillAccent: {
    backgroundColor: THEME.accentSoft,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.ink,
  },
  pillTextAccent: {
    color: THEME.accent,
  },
  button: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    flex: 1,
  },
  buttonPrimary: {
    backgroundColor: THEME.accent,
  },
  buttonGhost: {
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  buttonLabelPrimary: {
    color: '#ffffff',
  },
  buttonLabelGhost: {
    color: THEME.ink,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  softCard: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: THEME.surface,
    gap: 8,
  },
  successCard: {
    backgroundColor: THEME.successSoft,
  },
  listRow: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: THEME.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listRowDone: {
    backgroundColor: THEME.accentSoft,
  },
  itemTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: THEME.ink,
  },
  itemBody: {
    fontSize: 14,
    lineHeight: 20,
    color: THEME.muted,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    borderRadius: 22,
    padding: 14,
    backgroundColor: THEME.surface,
    gap: 6,
  },
  metricLabel: {
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: THEME.muted,
    fontWeight: '700',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '800',
    color: THEME.ink,
  },
  input: {
    minHeight: 52,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: THEME.border,
    color: THEME.ink,
    fontSize: 15,
  },
  editorCard: {
    borderRadius: 24,
    padding: 14,
    backgroundColor: THEME.surface,
    gap: 10,
  },
  editorGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  miniField: {
    flex: 1,
    gap: 6,
  },
  miniLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: THEME.muted,
    fontWeight: '700',
  },
  miniInput: {
    minHeight: 44,
    borderRadius: 16,
    paddingHorizontal: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: THEME.border,
    color: THEME.ink,
    fontSize: 14,
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  segment: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: THEME.surface,
  },
  segmentActive: {
    backgroundColor: THEME.accent,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.muted,
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  tabBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    borderRadius: 28,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.94)',
    flexDirection: 'row',
    gap: 8,
    shadowColor: THEME.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  tabItem: {
    flex: 1,
    borderRadius: 22,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemActive: {
    backgroundColor: THEME.accentSoft,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.muted,
  },
  tabLabelActive: {
    color: THEME.accent,
  },
})
