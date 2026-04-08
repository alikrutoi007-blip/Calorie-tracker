import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

export async function requestMomentumNotifications() {
  if (!Device.isDevice) {
    return {
      ok: false,
      status: 'simulator',
      message: 'Push permissions should be tested on a real iPhone device.',
    }
  }

  const existing = await Notifications.getPermissionsAsync()
  let status = existing.status

  if (status !== 'granted') {
    const next = await Notifications.requestPermissionsAsync()
    status = next.status
  }

  return {
    ok: status === 'granted',
    status,
    message: status === 'granted'
      ? 'Notifications are ready for gentle check-ins.'
      : 'Notifications were not granted yet.',
  }
}

export async function scheduleLocalMomentumReminder({ hour, title, body }) {
  const triggerDate = new Date()
  triggerDate.setHours(hour, 0, 0, 0)

  if (triggerDate <= new Date()) {
    triggerDate.setDate(triggerDate.getDate() + 1)
  }

  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
    },
    trigger: triggerDate,
  })
}

export async function scheduleMomentumReminderPair({ morningHour, eveningHour }) {
  const morningId = await scheduleLocalMomentumReminder({
    hour: morningHour,
    title: 'Momentum morning check-in',
    body: 'Open the day with one tiny action before the noise starts.',
  })

  const eveningId = await scheduleLocalMomentumReminder({
    hour: eveningHour,
    title: 'Momentum evening closure',
    body: 'Close the loop softly: one log, one note, then stop.',
  })

  return { morningId, eveningId }
}
