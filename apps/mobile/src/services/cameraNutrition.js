import { getMobileAccessToken, getMobileSupabaseClient, getMobileSupabaseKey, getMobileSupabaseUrl } from './supabase'

const MEAL_CAPTURE_BUCKET = 'meal-captures'

function sanitizeFilename(filename) {
  return filename.toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-')
}

async function fileUriToBlob(uri) {
  const response = await fetch(uri)
  if (!response.ok) {
    throw new Error('The selected file could not be opened from the device cache.')
  }

  return response.blob()
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('The selected file could not be converted for analysis.'))
    reader.onloadend = () => resolve(reader.result)
    reader.readAsDataURL(blob)
  })
}

export async function buildDataUrlFromUri(uri) {
  const blob = await fileUriToBlob(uri)
  return blobToDataUrl(blob)
}

export async function uploadMealPhoto({ userId, uri, fileName = 'meal.jpg', mimeType = 'image/jpeg' }) {
  const client = getMobileSupabaseClient()
  if (!client || !userId) return ''

  const extension = fileName.includes('.') ? fileName.split('.').pop() : 'jpg'
  const path = `${userId}/${Date.now()}-${sanitizeFilename(fileName || `meal.${extension}`)}`
  const fileBlob = await fileUriToBlob(uri)

  const { data, error } = await client.storage
    .from(MEAL_CAPTURE_BUCKET)
    .upload(path, fileBlob, {
      contentType: mimeType,
      cacheControl: '3600',
      upsert: false,
    })

  if (error) throw error
  return data.path
}

export async function analyzeMealWithEdge(payload) {
  const url = getMobileSupabaseUrl()
  const key = getMobileSupabaseKey()
  const token = await getMobileAccessToken()

  if (!url || !key) {
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

  const response = await fetch(`${url}/functions/v1/analyze-meal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${token || key}`,
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json()

  if (!response.ok || data.status === 'error') {
    throw new Error(data.message || 'Meal analysis failed in the edge function.')
  }

  return data
}

export async function analyzeCapturedMeal({
  mealText,
  photoUri,
  photoName,
  photoMimeType,
  audioUri,
  audioMimeType,
  locale,
  dateKey,
  userId,
}) {
  const transcript = mealText?.trim() || ''
  const source = photoUri ? 'photo' : audioUri ? 'voice' : 'manual'

  let imageDataUrl = ''
  let storagePath = ''
  let audioDataUrl = ''

  if (photoUri) {
    imageDataUrl = await buildDataUrlFromUri(photoUri)

    if (userId) {
      storagePath = await uploadMealPhoto({
        userId,
        uri: photoUri,
        fileName: photoName || 'meal.jpg',
        mimeType: photoMimeType || 'image/jpeg',
      })
    }
  }

  if (audioUri) {
    audioDataUrl = await buildDataUrlFromUri(audioUri)
  }

  return analyzeMealWithEdge({
    source,
    transcript,
    imageDataUrl: imageDataUrl || undefined,
    imageName: photoName || undefined,
    storagePath: storagePath || undefined,
    audioDataUrl: audioDataUrl || undefined,
    audioMimeType: audioMimeType || undefined,
    locale: locale || 'en-US',
    dateKey,
  })
}
