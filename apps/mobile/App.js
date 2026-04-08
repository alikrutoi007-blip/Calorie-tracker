import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Image, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { StatusBar as ExpoStatusBar } from 'expo-status-bar'
import { analyzeCapturedMeal } from './src/services/cameraNutrition'
import { fetchCloudProfile, fetchMealCaptures, getCloudSession, onCloudAuthChange, pullCloudSnapshot, pushCloudSnapshot, signInWithPassword, signOutFromCloud, signUpWithPassword, updateCloudProfile } from './src/services/cloudSync'
import { connectHealthkitPreview, getHealthkitSnapshotPreview } from './src/services/healthkit'
import { requestMomentumNotifications, scheduleMomentumReminderPair } from './src/services/notifications'
import { configureSubscriptions, getSubscriptionPreview, startSubscriptionCheckout } from './src/services/subscriptions'
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
  const cameraRef = useRef(null)
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const recorderState = useAudioRecorderState(recorder)
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const [tab, setTab] = useState('habits')
  const [settingsSection, setSettingsSection] = useState('notifications')
  const [state, setState] = useState(seed)
  const [mealText, setMealText] = useState('Chicken rice bowl, sweet tea, one spoon of oil')
  const [analysis, setAnalysis] = useState(seed.calories.analysis)
  const [mealBusy, setMealBusy] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [authMode, setAuthMode] = useState('signin')
  const [authEmail, setAuthEmail] = useState(seed.profile.email)
  const [authPassword, setAuthPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('Sign in with email and password to sync meals, snapshots and subscriptions.')
  const [cloudUser, setCloudUser] = useState(null)
  const [cloudProfile, setCloudProfile] = useState(null)
  const [mealHistory, setMealHistory] = useState([])
  const [cameraOpen, setCameraOpen] = useState(false)
  const [capturedPhoto, setCapturedPhoto] = useState(null)
  const [voiceClip, setVoiceClip] = useState(null)
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
      const { user } = await getCloudSession()
      const subscription = await getSubscriptionPreview(user?.id || '')
      const health = await getHealthkitSnapshotPreview()

      if (!mounted) return

      setServiceState((previous) => ({
        ...previous,
        cloud: cloud.configured ? (cloud.signedIn ? 'Supabase mobile sync is connected.' : 'Supabase mobile sync is configured.') : previous.cloud,
        subscriptions: subscription.configured ? 'RevenueCat keys are present.' : previous.subscriptions,
        health: health.source === 'preview' ? 'HealthKit preview lane is ready for iPhone.' : 'HealthKit is reading live data.',
      }))
      setCloudUser(user || null)

      if (user) {
        await hydrateCloudState(user)
      }
    }

    bootstrap()

    const unsubscribe = onCloudAuthChange(async ({ user }) => {
      if (!mounted) return

      setCloudUser(user || null)

      if (user) {
        await hydrateCloudState(user)
      } else {
        setCloudProfile(null)
        setMealHistory([])
        setAuthMessage('Signed out. Local state stays on device until you sync again.')
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [hydrateCloudState])

  const todayKey = new Date().toISOString().slice(0, 10)
  const checkins = state.reminders.checkins[todayKey] || { morning: false, evening: false }
  const smartChef = state.subscription.plan === 'pro' ? state.calories.smartChef : state.calories.smartChef.slice(0, 1)

  function patchState(updater) {
    setState((previous) => updater(previous))
  }

  const hydrateCloudState = useCallback(async (user) => {
    const [profile, captures, snapshot, subscription] = await Promise.all([
      fetchCloudProfile(user.id),
      fetchMealCaptures(user.id, { limit: 12 }),
      pullCloudSnapshot(user.id),
      getSubscriptionPreview(user.id),
    ])

    setCloudProfile(profile || null)
    setMealHistory(captures || [])
    setAuthEmail(user.email || authEmail)
    setServiceState((previous) => ({
      ...previous,
      cloud: 'Supabase account is connected and ready to sync.',
      subscriptions: subscription.offeringsReady ? 'RevenueCat offerings are ready.' : previous.subscriptions,
    }))

    if (snapshot?.payload?.mobileState) {
      setState((previous) => ({
        ...previous,
        ...snapshot.payload.mobileState,
      }))
    }
  }, [authEmail])

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

  async function handleAuthSubmit() {
    if (!authEmail.trim() || !authPassword.trim()) {
      Alert.alert('Account', 'Enter both email and password first.')
      return
    }

    setAuthBusy(true)

    try {
      if (authMode === 'signup') {
        await signUpWithPassword({
          email: authEmail.trim(),
          password: authPassword,
          displayName: state.profile.name,
        })
        setAuthMessage('Account created. If email confirmation is enabled, confirm it once and then sign in.')
      } else {
        const result = await signInWithPassword({
          email: authEmail.trim(),
          password: authPassword,
        })

        setCloudUser(result.user || null)
        setAuthMessage('Signed in. Cloud sync, meal history, and subscriptions are now linked to this account.')

        if (result.user) {
          await updateCloudProfile(result.user.id, {
            email: authEmail.trim(),
            display_name: state.profile.name,
          })
          await hydrateCloudState(result.user)
          await configureSubscriptions(result.user.id)
        }
      }
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : 'Account flow failed.')
      Alert.alert('Account', error instanceof Error ? error.message : 'Account flow failed.')
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleSignOut() {
    try {
      await signOutFromCloud()
      setCloudUser(null)
      setCloudProfile(null)
      setMealHistory([])
      setAuthPassword('')
      setAuthMessage('Signed out. Local phone state is still available.')
    } catch (error) {
      Alert.alert('Account', error instanceof Error ? error.message : 'Sign out failed.')
    }
  }

  async function syncNow() {
    if (!cloudUser) {
      Alert.alert('Sync', 'Sign in first to push this phone state to Supabase.')
      return
    }

    try {
      await updateCloudProfile(cloudUser.id, {
        email: cloudUser.email || authEmail.trim(),
        display_name: state.profile.name,
      })
      await pushCloudSnapshot(cloudUser.id, { mobileState: state })
      setAuthMessage('Phone state synced to Supabase.')
      await hydrateCloudState(cloudUser)
    } catch (error) {
      Alert.alert('Sync', error instanceof Error ? error.message : 'Sync failed.')
    }
  }

  async function restoreFromCloud() {
    if (!cloudUser) {
      Alert.alert('Restore', 'Sign in first to restore the latest cloud snapshot.')
      return
    }

    try {
      const snapshot = await pullCloudSnapshot(cloudUser.id)
      if (snapshot?.payload?.mobileState) {
        setState((previous) => ({
          ...previous,
          ...snapshot.payload.mobileState,
        }))
        setAuthMessage('Latest cloud snapshot restored to this device.')
      } else {
        setAuthMessage('No cloud snapshot found yet.')
      }
    } catch (error) {
      Alert.alert('Restore', error instanceof Error ? error.message : 'Restore failed.')
    }
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
    const snapshot = await getHealthkitSnapshotPreview()
    setServiceState((previous) => ({ ...previous, health: result.message }))
    if (snapshot.source === 'healthkit') {
      patchState((previous) => ({
        ...previous,
        sleep: {
          ...previous.sleep,
          today: snapshot.sleepHours || previous.sleep.today,
        },
        calories: {
          ...previous.calories,
          consumed: snapshot.calories || previous.calories.consumed,
        },
      }))
    }
    Alert.alert('HealthKit', result.message)
  }

  async function openCamera() {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission()
      if (!permission.granted) {
        Alert.alert('Camera', 'Camera permission is needed to capture meals.')
        return
      }
    }

    setCameraOpen(true)
  }

  async function capturePhoto() {
    if (!cameraRef.current) return

    try {
      const picture = await cameraRef.current.takePictureAsync({
        quality: 0.8,
      })

      if (picture?.uri) {
        setCapturedPhoto({
          uri: picture.uri,
          fileName: `meal-${Date.now()}.jpg`,
          mimeType: 'image/jpeg',
        })
        setCameraOpen(false)
      }
    } catch (error) {
      Alert.alert('Camera', error instanceof Error ? error.message : 'Photo capture failed.')
    }
  }

  async function toggleVoiceRecording() {
    try {
      if (recorderState.isRecording) {
        await recorder.stop()
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: false })

        if (recorder.uri) {
          setVoiceClip({
            uri: recorder.uri,
            mimeType: 'audio/mp4',
          })
          Alert.alert('Voice note', 'Voice note recorded. It will be transcribed during meal analysis.')
        }
        return
      }

      const permission = await AudioModule.requestRecordingPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Microphone', 'Microphone permission is needed for natural meal notes.')
        return
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY)
      recorder.record()
    } catch (error) {
      Alert.alert('Microphone', error instanceof Error ? error.message : 'Voice recording failed.')
    }
  }

  async function analyzeMeal() {
    setMealBusy(true)

    try {
      const result = await analyzeCapturedMeal({
        mealText,
        photoUri: capturedPhoto?.uri,
        photoName: capturedPhoto?.fileName,
        photoMimeType: capturedPhoto?.mimeType,
        audioUri: voiceClip?.uri,
        audioMimeType: voiceClip?.mimeType,
        locale: 'en-US',
        dateKey: todayKey,
        userId: cloudUser?.id || '',
      })

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

      if (result.transcript) {
        setMealText(result.transcript)
      }

      if (cloudUser) {
        const captures = await fetchMealCaptures(cloudUser.id, { limit: 12 })
        setMealHistory(captures || [])
      }

      Alert.alert('Meal analyzed', result.message || 'Review and confirm the meal before saving it.')
    } catch (error) {
      Alert.alert('Meal analysis', error instanceof Error ? error.message : 'Meal analysis failed.')
    } finally {
      setMealBusy(false)
    }
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
    const result = await startSubscriptionCheckout(cloudUser?.id || '')
    setServiceState((previous) => ({ ...previous, subscriptions: result.message }))
    if (result.ok) {
      patchState((previous) => ({
        ...previous,
        subscription: {
          ...previous.subscription,
          plan: 'pro',
        },
      }))
    }
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

              <Card eyebrow="CAPTURE" title="Photo + voice + natural language" right={<Pill>{cloudUser ? 'Cloud-linked' : 'Local only'}</Pill>}>
                {cameraOpen ? (
                  <View style={styles.cameraShell}>
                    <CameraView ref={cameraRef} style={styles.camera} facing="back" />
                    <View style={styles.buttonRow}>
                      <Button label="Take photo" onPress={capturePhoto} />
                      <Button label="Close" onPress={() => setCameraOpen(false)} ghost />
                    </View>
                  </View>
                ) : null}

                {capturedPhoto?.uri ? (
                  <View style={styles.softCard}>
                    <Image source={{ uri: capturedPhoto.uri }} style={styles.previewImage} />
                    <Text style={styles.itemBody}>Meal photo attached and ready for upload to Supabase Storage.</Text>
                  </View>
                ) : null}

                <View style={styles.buttonRow}>
                  <Button label={capturedPhoto ? 'Retake photo' : 'Open camera'} onPress={openCamera} ghost />
                  <Button label={recorderState.isRecording ? 'Stop voice note' : voiceClip ? 'Re-record voice note' : 'Record voice note'} onPress={toggleVoiceRecording} ghost />
                </View>

                {voiceClip?.uri ? (
                  <View style={styles.softCard}>
                    <Text style={styles.itemTitle}>Voice note attached</Text>
                    <Text style={styles.itemBody}>Your voice note will be transcribed on the edge function and merged with the meal photo.</Text>
                  </View>
                ) : null}

                <TextInput
                  style={styles.input}
                  value={mealText}
                  onChangeText={setMealText}
                  placeholder="Chicken rice bowl, sweet tea, one spoon of oil"
                  placeholderTextColor={THEME.muted}
                />
                <View style={styles.buttonRow}>
                  <Button label={mealBusy ? 'Analyzing...' : 'Analyze meal'} onPress={analyzeMeal} />
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

              <Card eyebrow="CLOUD HISTORY" title="Recent analyzed meals" right={<Pill>{mealHistory.length}</Pill>}>
                {(mealHistory.length ? mealHistory : []).map((meal) => (
                  <View key={meal.id} style={styles.softCard}>
                    {meal.imageUrl ? <Image source={{ uri: meal.imageUrl }} style={styles.historyImage} /> : null}
                    <Text style={styles.itemTitle}>{meal.summary}</Text>
                    <Text style={styles.itemBody}>{meal.total_calories || 0} kcal</Text>
                    <Text style={styles.itemBody}>P {meal.total_macros?.protein || 0} / F {meal.total_macros?.fat || 0} / C {meal.total_macros?.carbs || 0}</Text>
                  </View>
                ))}
                {!mealHistory.length ? (
                  <View style={styles.softCard}>
                    <Text style={styles.itemBody}>Sign in and analyze one meal to start a real cloud history.</Text>
                  </View>
                ) : null}
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
                    <Text style={styles.itemTitle}>{cloudUser ? cloudUser.email : 'Supabase account sync'}</Text>
                    <Text style={styles.itemBody}>{authMessage}</Text>
                  </View>

                  {!cloudUser ? (
                    <>
                      <TextInput
                        style={styles.input}
                        value={authEmail}
                        onChangeText={setAuthEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        placeholder="Email"
                        placeholderTextColor={THEME.muted}
                      />
                      <TextInput
                        style={styles.input}
                        value={authPassword}
                        onChangeText={setAuthPassword}
                        secureTextEntry
                        placeholder="Password"
                        placeholderTextColor={THEME.muted}
                      />
                      <View style={styles.buttonRow}>
                        <Button label={authBusy ? 'Working...' : authMode === 'signup' ? 'Create account' : 'Sign in'} onPress={handleAuthSubmit} />
                        <Button label={authMode === 'signup' ? 'Use sign in' : 'Use sign up'} onPress={() => setAuthMode((previous) => previous === 'signup' ? 'signin' : 'signup')} ghost />
                      </View>
                    </>
                  ) : (
                    <View style={styles.buttonRow}>
                      <Button label="Sync now" onPress={syncNow} />
                      <Button label="Restore latest" onPress={restoreFromCloud} ghost />
                    </View>
                  )}

                  {cloudProfile ? (
                    <View style={styles.softCard}>
                      <Text style={styles.itemTitle}>{cloudProfile.display_name || state.profile.name}</Text>
                      <Text style={styles.itemBody}>Profile synced at {new Date(cloudProfile.updated_at).toLocaleString()}</Text>
                    </View>
                  ) : null}

                  {cloudUser ? <Button label="Sign out" onPress={handleSignOut} ghost /> : null}
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
                  <View style={styles.softCard}>
                    <Text style={styles.itemTitle}>RevenueCat + App Store Connect</Text>
                    <Text style={styles.itemBody}>On Windows, build iOS in the cloud with EAS. Local `expo run:ios` will never work outside macOS.</Text>
                  </View>
                  <Button label="Open RevenueCat checkout" onPress={openCheckout} />
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
  cameraShell: {
    borderRadius: 24,
    overflow: 'hidden',
    gap: 10,
  },
  camera: {
    width: '100%',
    height: 260,
    borderRadius: 24,
    overflow: 'hidden',
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
  previewImage: {
    width: '100%',
    height: 180,
    borderRadius: 18,
    backgroundColor: THEME.bgSoft,
  },
  historyImage: {
    width: '100%',
    height: 140,
    borderRadius: 18,
    backgroundColor: THEME.bgSoft,
    marginBottom: 4,
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
