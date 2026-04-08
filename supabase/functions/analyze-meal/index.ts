import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

type MealRequest = {
  source: 'photo' | 'voice' | 'manual';
  transcript?: string;
  imageDataUrl?: string;
  imageName?: string;
  storagePath?: string;
  audioDataUrl?: string;
  audioMimeType?: string;
  locale?: string;
  dateKey?: string;
};

type MacroTotals = {
  protein: number;
  fat: number;
  carbs: number;
};

type ParsedFood = {
  name?: string;
  quantityText?: string;
  estimatedCalories?: number | null;
  estimatedMacros?: Partial<MacroTotals> | null;
};

type ParsedMeal = {
  summary?: string;
  foods?: ParsedFood[];
  glycemicNote?: string;
  energyForecast?: string;
  coachNote?: string;
};

type NutritionFood = {
  name: string;
  quantityText: string;
  calories: number | null;
  protein: number;
  fat: number;
  carbs: number;
};

type NutritionResult = {
  provider: string;
  totalCalories: number | null;
  totalMacros: MacroTotals;
  foods: NutritionFood[];
  raw: unknown;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function extractOutputText(payload: any) {
  if (payload.output_text) return payload.output_text;

  const collected = payload.output
    ?.flatMap((item: any) => item.content || [])
    ?.filter((item: any) => item.type === 'output_text')
    ?.map((item: any) => item.text)
    ?.join('\n');

  return collected || '';
}

function parseLooseJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();

  try {
    return JSON.parse(fenced);
  } catch {
    const match = fenced.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('OpenAI did not return JSON.');
    return JSON.parse(match[0]);
  }
}

function roundNumber(value: number | null | undefined) {
  return Math.round(Number(value) || 0);
}

function normalizeMacros(macros?: Partial<MacroTotals> | null): MacroTotals {
  return {
    protein: roundNumber(macros?.protein),
    fat: roundNumber(macros?.fat),
    carbs: roundNumber(macros?.carbs),
  };
}

function sumMacros(foods: Array<{ protein?: number | null; fat?: number | null; carbs?: number | null }>): MacroTotals {
  return foods.reduce(
    (totals, food) => ({
      protein: totals.protein + roundNumber(food.protein),
      fat: totals.fat + roundNumber(food.fat),
      carbs: totals.carbs + roundNumber(food.carbs),
    }),
    { protein: 0, fat: 0, carbs: 0 },
  );
}

async function callOpenAIForMealShape(request: MealRequest, apiKey: string) {
  const userText = request.transcript?.trim()
    ? `User meal note: ${request.transcript.trim()}`
    : 'No voice or typed meal note was provided.';

  const prompt = `You are a food logging assistant.
Return strict JSON only with this shape:
{
  "summary": "short meal summary",
  "foods": [
    {
      "name": "food name",
      "quantityText": "human serving text",
      "estimatedCalories": 0,
      "estimatedMacros": {
        "protein": 0,
        "fat": 0,
        "carbs": 0
      }
    }
  ],
  "glycemicNote": "one short note about blood sugar or sleepiness risk",
  "energyForecast": "one short note about how the meal may feel later",
  "coachNote": "one short coaching note to improve the meal"
}
Rules:
- Use integers for calories and macro grams.
- If you are unsure, make best-effort estimates.
- Keep notes short, practical and non-medical.
- Locale: ${request.locale || 'en-US'}.
${userText}`;

  const content = [
    {
      type: 'input_text',
      text: prompt,
    },
  ];

  if (request.imageDataUrl) {
    content.push({
      type: 'input_image',
      image_url: request.imageDataUrl,
    } as any);
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_MEAL_MODEL') || 'gpt-4.1-mini',
      input: [
        {
          role: 'user',
          content,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI meal parse failed: ${text}`);
  }

  const payload = await response.json();
  return parseLooseJson(extractOutputText(payload)) as ParsedMeal;
}

async function getNutritionWithNutritionix(query: string): Promise<NutritionResult | null> {
  const appId = Deno.env.get('NUTRITIONIX_APP_ID');
  const appKey = Deno.env.get('NUTRITIONIX_APP_KEY');
  if (!appId || !appKey) return null;

  const response = await fetch('https://trackapi.nutritionix.com/v2/natural/nutrients', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-app-id': appId,
      'x-app-key': appKey,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Nutritionix failed: ${text}`);
  }

  const payload = await response.json();
  const foods = (payload.foods || []).map((food: any) => ({
    name: food.food_name,
    quantityText: `${food.serving_qty || ''} ${food.serving_unit || ''}`.trim(),
    calories: roundNumber(food.nf_calories),
    protein: roundNumber(food.nf_protein),
    fat: roundNumber(food.nf_total_fat),
    carbs: roundNumber(food.nf_total_carbohydrate),
  }));

  return {
    provider: 'nutritionix',
    totalCalories: roundNumber((payload.foods || []).reduce((total: number, food: any) => total + (food.nf_calories || 0), 0)),
    totalMacros: sumMacros(foods),
    foods,
    raw: payload,
  };
}

async function getNutritionWithEdamam(lines: string[]): Promise<NutritionResult | null> {
  const appId = Deno.env.get('EDAMAM_APP_ID');
  const appKey = Deno.env.get('EDAMAM_APP_KEY');
  if (!appId || !appKey) return null;

  const response = await fetch(`https://api.edamam.com/api/nutrition-details?app_id=${appId}&app_key=${appKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Momentum meal capture', ingr: lines }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Edamam failed: ${text}`);
  }

  const payload = await response.json();
  const foods = (payload.ingredients || []).map((ingredient: any) => ({
    name: ingredient.parsed?.[0]?.food || ingredient.text,
    quantityText: ingredient.text,
    calories: roundNumber(ingredient.parsed?.[0]?.nutrients?.ENERC_KCAL?.quantity),
    protein: roundNumber(ingredient.parsed?.[0]?.nutrients?.PROCNT?.quantity),
    fat: roundNumber(ingredient.parsed?.[0]?.nutrients?.FAT?.quantity),
    carbs: roundNumber(ingredient.parsed?.[0]?.nutrients?.CHOCDF?.quantity),
  }));

  return {
    provider: 'edamam',
    totalCalories: roundNumber(payload.calories),
    totalMacros: {
      protein: roundNumber(payload.totalNutrients?.PROCNT?.quantity),
      fat: roundNumber(payload.totalNutrients?.FAT?.quantity),
      carbs: roundNumber(payload.totalNutrients?.CHOCDF?.quantity),
    },
    foods,
    raw: payload,
  };
}

function buildOpenAiOnlyNutrition(parsed: ParsedMeal): NutritionResult {
  const foods = (parsed.foods || []).map((food) => ({
    name: food.name || 'meal item',
    quantityText: food.quantityText || '1 serving',
    calories: food.estimatedCalories == null ? null : roundNumber(food.estimatedCalories),
    protein: roundNumber(food.estimatedMacros?.protein),
    fat: roundNumber(food.estimatedMacros?.fat),
    carbs: roundNumber(food.estimatedMacros?.carbs),
  }));

  return {
    provider: 'openai-estimate',
    totalCalories: foods.reduce((total, food) => total + (food.calories || 0), 0) || null,
    totalMacros: sumMacros(foods),
    foods,
    raw: parsed,
  };
}

function mergeFoods(parsedFoods: ParsedFood[] = [], nutritionFoods: NutritionFood[] = []) {
  const longest = Math.max(parsedFoods.length, nutritionFoods.length);

  return Array.from({ length: longest }, (_, index) => {
    const parsed = parsedFoods[index];
    const nutrition = nutritionFoods[index];

    return {
      name: nutrition?.name || parsed?.name || 'meal item',
      quantityText: nutrition?.quantityText || parsed?.quantityText || '1 serving',
      calories: nutrition?.calories ?? (parsed?.estimatedCalories == null ? null : roundNumber(parsed.estimatedCalories)),
      protein: nutrition?.protein ?? roundNumber(parsed?.estimatedMacros?.protein),
      fat: nutrition?.fat ?? roundNumber(parsed?.estimatedMacros?.fat),
      carbs: nutrition?.carbs ?? roundNumber(parsed?.estimatedMacros?.carbs),
    };
  });
}

async function transcribeAudioDataUrl(audioDataUrl: string, mimeType: string | undefined, apiKey: string, locale: string | undefined) {
  const fileResponse = await fetch(audioDataUrl);
  if (!fileResponse.ok) {
    throw new Error('Audio data could not be read for transcription.');
  }

  const audioBlob = await fileResponse.blob();
  const formData = new FormData();
  formData.append('file', new File([audioBlob], `meal-note.${mimeType?.includes('wav') ? 'wav' : 'm4a'}`, {
    type: mimeType || audioBlob.type || 'audio/mp4',
  }));
  formData.append('model', Deno.env.get('OPENAI_TRANSCRIBE_MODEL') || 'gpt-4o-mini-transcribe');
  formData.append('response_format', 'json');

  if (locale) {
    formData.append('language', locale.slice(0, 2));
  }

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI transcription failed: ${text}`);
  }

  const payload = await response.json();
  return String(payload.text || '').trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return json({ status: 'setup_required', message: 'Supabase environment variables are missing.' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization') || '',
        },
      },
    });

    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    const {
      data: { user },
    } = token ? await supabase.auth.getUser(token) : { data: { user: null } };

    const body = (await req.json()) as MealRequest;
    if (!body?.source) return json({ status: 'error', message: 'source is required.' });

    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAiKey) {
      return json({ status: 'setup_required', message: 'OPENAI_API_KEY is missing for meal analysis.' });
    }

    const transcribedAudio = body.audioDataUrl
      ? await transcribeAudioDataUrl(body.audioDataUrl, body.audioMimeType, openAiKey, body.locale)
      : '';
    const effectiveTranscript = [body.transcript || '', transcribedAudio].filter(Boolean).join('. ').trim();

    const parsed = await callOpenAIForMealShape({
      ...body,
      transcript: effectiveTranscript,
    }, openAiKey);
    const lines = (parsed.foods || []).map((food) => `${food.quantityText || '1 serving'} ${food.name || 'meal item'}`.trim());
    const nutritionQuery = lines.join(', ') || effectiveTranscript || parsed.summary || '';
    const nutrition = await getNutritionWithNutritionix(nutritionQuery)
      || await getNutritionWithEdamam(lines)
      || buildOpenAiOnlyNutrition(parsed);

    const mergedFoods = mergeFoods(parsed.foods || [], nutrition.foods || []);
    const totalMacros = nutrition.totalMacros || sumMacros(mergedFoods);
    const totalCalories = nutrition.totalCalories ?? (mergedFoods.reduce((total, food) => total + (food.calories || 0), 0) || null);

    let savedId = null;

    if (user) {
      const { data, error } = await supabase
        .from('meal_captures')
        .insert({
          user_id: user.id,
          source: body.source,
          summary: parsed.summary || 'Meal captured',
          transcript: effectiveTranscript || null,
          image_name: body.imageName || null,
          storage_path: body.storagePath || null,
          provider: nutrition.provider,
          total_calories: totalCalories,
          foods: mergedFoods,
          date_key: body.dateKey || null,
          raw_payload: {
            mealParse: parsed,
            nutrition: nutrition.raw,
            locale: body.locale,
            dateKey: body.dateKey,
            transcript: effectiveTranscript,
            analysis: {
              totalMacros,
              glycemicNote: parsed.glycemicNote || '',
              energyForecast: parsed.energyForecast || '',
              coachNote: parsed.coachNote || '',
            },
          },
        })
        .select('id')
        .single();

      if (error) {
        return json({ status: 'error', message: error.message || 'Meal could not be saved to Supabase.' });
      }

      savedId = data?.id || null;
    }

    return json({
      status: 'ok',
      provider: nutrition.provider,
      summary: parsed.summary || 'Meal captured',
      totalCalories,
      totalMacros,
      glycemicNote: parsed.glycemicNote || '',
      energyForecast: parsed.energyForecast || '',
      coachNote: parsed.coachNote || '',
      foods: mergedFoods,
      transcript: effectiveTranscript,
      savedId,
    });
  } catch (error) {
    return json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unexpected edge function error.',
    });
  }
});
