import Purchases from 'react-native-purchases'
import Constants from 'expo-constants'

function getRevenueCatApiKey() {
  return Constants.expoConfig?.extra?.revenueCatApiKeyIos || ''
}

export async function configureSubscriptionsPreview() {
  const apiKey = getRevenueCatApiKey()

  if (!apiKey) {
    return {
      ok: false,
      message: 'RevenueCat API key is still missing in app.json or EAS secrets.',
    }
  }

  await Purchases.configure({ apiKey })

  return {
    ok: true,
    message: 'RevenueCat is configured for App Store subscriptions.',
  }
}

export async function getSubscriptionPreview() {
  const apiKey = getRevenueCatApiKey()

  return {
    configured: Boolean(apiKey),
    offeringsReady: Boolean(apiKey),
    activePlan: 'free',
  }
}

export async function startSubscriptionCheckoutPreview() {
  const preview = await getSubscriptionPreview()

  if (!preview.configured) {
    return {
      ok: false,
      message: 'RevenueCat is not configured yet, so checkout stays in preview mode.',
    }
  }

  return {
    ok: true,
    message: 'RevenueCat checkout should open here once offerings are created in App Store Connect.',
  }
}
