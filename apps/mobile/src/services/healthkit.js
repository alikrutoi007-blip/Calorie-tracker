import { Platform } from 'react-native'

export async function connectHealthkitPreview() {
  if (Platform.OS !== 'ios') {
    return {
      ok: false,
      status: 'unavailable',
      message: 'HealthKit is only available on iPhone.',
    }
  }

  return {
    ok: true,
    status: 'scaffolded',
    message: 'HealthKit lane is scaffolded. Next step is wiring react-native-health in a custom Expo development build.',
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

  return {
    sleepHours: 6.9,
    calories: 1720,
    source: 'preview',
  }
}
