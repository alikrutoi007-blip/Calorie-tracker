import Constants from 'expo-constants'
import { Platform } from 'react-native'

function isExpoGo() {
  return Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo'
}

async function getHealthkitModule() {
  if (isExpoGo()) return null

  try {
    return await import('@kingstinct/react-native-healthkit')
  } catch {
    return null
  }
}

function hoursBetween(startDate, endDate) {
  const start = new Date(startDate).getTime()
  const end = new Date(endDate).getTime()
  return Math.max(0, Math.round(((end - start) / 36e5) * 10) / 10)
}

export async function connectHealthkitPreview() {
  if (Platform.OS !== 'ios') {
    return {
      ok: false,
      status: 'unavailable',
      message: 'HealthKit is only available on iPhone.',
    }
  }

  if (isExpoGo()) {
    return {
      ok: false,
      status: 'expo_go',
      message: 'HealthKit is disabled in Expo Go. Use an EAS dev build later for the real iPhone HealthKit lane.',
    }
  }

  const healthkit = await getHealthkitModule()
  if (!healthkit) {
    return {
      ok: false,
      status: 'missing_module',
      message: 'HealthKit package is not installed in the native build yet. Run npm install in apps/mobile and create a dev build.',
    }
  }

  const available = await healthkit.isHealthDataAvailable()
  if (!available) {
    return {
      ok: false,
      status: 'unavailable',
      message: 'Health data is not available on this device.',
    }
  }

  await healthkit.requestAuthorization([
    {
      accessType: 'read',
      recordType: 'HKCategoryTypeIdentifierSleepAnalysis',
    },
    {
      accessType: 'read',
      recordType: 'HKQuantityTypeIdentifierDietaryEnergyConsumed',
    },
  ])

  return {
    ok: true,
    status: 'connected',
    message: 'HealthKit authorization was granted for sleep and dietary energy.',
  }
}

export async function getHealthkitSnapshotPreview() {
  if (Platform.OS !== 'ios') {
    return {
      sleepHours: 0,
      calories: 0,
      source: 'unsupported',
    }
  }

  if (isExpoGo()) {
    return {
      sleepHours: 6.9,
      calories: 1720,
      source: 'expo-go-preview',
    }
  }

  const healthkit = await getHealthkitModule()
  if (!healthkit) {
    return {
      sleepHours: 6.9,
      calories: 1720,
      source: 'preview',
    }
  }

  try {
    const [sleep, calories] = await Promise.all([
      healthkit.getMostRecentCategorySample('HKCategoryTypeIdentifierSleepAnalysis'),
      healthkit.getMostRecentQuantitySample('HKQuantityTypeIdentifierDietaryEnergyConsumed', 'kcal'),
    ])

    return {
      sleepHours: sleep?.startDate && sleep?.endDate ? hoursBetween(sleep.startDate, sleep.endDate) : 0,
      calories: Math.round(Number(calories?.quantity) || 0),
      source: 'healthkit',
    }
  } catch {
    return {
      sleepHours: 6.9,
      calories: 1720,
      source: 'preview',
    }
  }
}
