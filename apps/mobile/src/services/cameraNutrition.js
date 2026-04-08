import Constants from 'expo-constants'

function getEdgeConfig() {
  return {
    url: Constants.expoConfig?.extra?.supabaseUrl || '',
    key: Constants.expoConfig?.extra?.supabasePublishableKey || '',
  }
}

export async function analyzeMealWithEdgePreview(payload) {
  const config = getEdgeConfig()

  if (!config.url || !config.key) {
    return {
      status: 'preview',
      summary: 'Preview meal analysis',
      totalCalories: 590,
      totalMacros: { protein: 33, fat: 21, carbs: 56 },
      foods: [
        { id: 'preview-1', name: 'Chicken thigh', quantity: '160 g', calories: 300, protein: 30, fat: 16, carbs: 0 },
        { id: 'preview-2', name: 'Rice', quantity: '200 g', calories: 230, protein: 4, fat: 1, carbs: 50 },
        { id: 'preview-3', name: 'Sauce', quantity: '1 tbsp', calories: 60, protein: 0, fat: 4, carbs: 6 },
      ],
      glycemicNote: 'Rice plus sauce may hit fast. Fiber or a protein-first snack later can smooth it.',
      energyForecast: 'Expect a quick energy lift followed by a mild dip in about an hour.',
      message: 'Supabase edge function is not configured in the mobile app yet, so this is a preview response.',
      payload,
    }
  }

  const response = await fetch(`${config.url}/functions/v1/analyze-meal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
    },
    body: JSON.stringify(payload),
  })

  return response.json()
}
