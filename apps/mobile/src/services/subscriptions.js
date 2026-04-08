import Purchases from 'react-native-purchases'
import Constants from 'expo-constants'

let configuredUserId = ''

function getRevenueCatApiKey() {
  return globalThis?.process?.env?.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || Constants.expoConfig?.extra?.revenueCatApiKeyIos || ''
}

export async function configureSubscriptions(userId = '') {
  const apiKey = getRevenueCatApiKey()

  if (!apiKey) {
    return {
      ok: false,
      message: 'RevenueCat API key is still missing in Expo env or app config.',
    }
  }

  if (configuredUserId === userId) {
    return {
      ok: true,
      message: 'RevenueCat is already configured for this user.',
    }
  }

  await Purchases.configure({
    apiKey,
    appUserID: userId || undefined,
  })

  configuredUserId = userId

  return {
    ok: true,
    message: 'RevenueCat is configured for App Store subscriptions.',
  }
}

export async function getSubscriptionPreview(userId = '') {
  const apiKey = getRevenueCatApiKey()

  if (!apiKey) {
    return {
      configured: false,
      offeringsReady: false,
      activePlan: 'free',
      offerings: [],
    }
  }

  try {
    await configureSubscriptions(userId)
    const [offerings, customerInfo] = await Promise.all([
      Purchases.getOfferings(),
      Purchases.getCustomerInfo(),
    ])

    return {
      configured: true,
      offeringsReady: Boolean(offerings.current),
      activePlan: Object.keys(customerInfo.entitlements.active || {}).length ? 'pro' : 'free',
      offerings: offerings.current?.availablePackages || [],
    }
  } catch (error) {
    return {
      configured: true,
      offeringsReady: false,
      activePlan: 'free',
      offerings: [],
      message: error instanceof Error ? error.message : 'RevenueCat could not load offerings yet.',
    }
  }
}

export async function startSubscriptionCheckout(userId = '') {
  const preview = await getSubscriptionPreview(userId)

  if (!preview.configured) {
    return {
      ok: false,
      message: 'RevenueCat is not configured yet, so checkout stays in preview mode.',
    }
  }

  if (!preview.offerings.length) {
    return {
      ok: false,
      message: 'No subscription packages are available yet. Add products in RevenueCat and App Store Connect first.',
    }
  }

  try {
    const purchaseResult = await Purchases.purchasePackage(preview.offerings[0])
    return {
      ok: true,
      message: 'Subscription purchase completed.',
      customerInfo: purchaseResult.customerInfo,
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Subscription checkout was cancelled or failed.',
    }
  }
}
