import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

type MealRequest = {
  source: 'photo' | 'voice' | 'manual';
  transcript?: string;
  imageDataUrl?: string;
  imageName?: string;
  storagePath?: string;
  locale?: string;
  dateKey?: string;
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

async function callOpenAIForMealShape(request: MealRequest, apiKey: string) {
  const input = request.source === 'photo'
    ? [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Identify the meal from this image and return strict JSON with this shape:
{
  "summary": "short meal summary",
  "foods": [{"name":"food name","quantityText":"human serving text"}]
}
Use best-effort serving estimates. Locale: ${request.locale || 'en-US'}.`,
            },
            {
              type: 'input_image',
              image_url: request.imageDataUrl,
            },
          ],
        },
      ]
    : [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Parse this meal log into strict JSON with this shape:
{
  "summary": "short meal summary",
  "foods": [{"name":"food name","quantityText":"human serving text"}]
}
Meal text: ${request.transcript || ''}`,
            },
          ],
        },
      ];

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_MEAL_MODEL') || 'gpt-4.1-mini',
      input,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI meal parse failed: ${text}`);
  }

  const payload = await response.json();
  const text = extractOutputText(payload);
  return JSON.parse(text);
}

async function getNutritionWithNutritionix(query: string) {
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
    calories: Math.round(food.nf_calories || 0),
  }));

  return {
    provider: 'nutritionix',
    totalCalories: Math.round((payload.foods || []).reduce((total: number, food: any) => total + (food.nf_calories || 0), 0)),
    foods,
    raw: payload,
  };
}

async function getNutritionWithEdamam(lines: string[]) {
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
    calories: Math.round(ingredient.parsed?.[0]?.nutrients?.ENERC_KCAL?.quantity || 0),
  }));

  return {
    provider: 'edamam',
    totalCalories: Math.round(payload.calories || 0),
    foods,
    raw: payload,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return json({ status: 'setup_required', message: 'Supabase environment variables are missing.' }, 500);
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
    if (!body?.source) return json({ status: 'error', message: 'source is required.' }, 400);

    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAiKey) {
      return json({ status: 'setup_required', message: 'OPENAI_API_KEY is missing for meal analysis.' }, 500);
    }

    const parsed = await callOpenAIForMealShape(body, openAiKey);
    const lines = (parsed.foods || []).map((food: { name?: string; quantityText?: string }) =>
      `${food.quantityText || '1 serving'} ${food.name || 'meal item'}`.trim(),
    );
    const nutritionQuery = lines.join(', ') || body.transcript || parsed.summary || '';

    const nutrition = await getNutritionWithNutritionix(nutritionQuery) || await getNutritionWithEdamam(lines) || {
      provider: 'openai-only',
      totalCalories: null,
      foods: (parsed.foods || []).map((food: { name?: string; quantityText?: string }) => ({
        name: food.name,
        quantityText: food.quantityText,
        calories: null,
      })),
      raw: parsed,
    };

    let savedId = null;

    if (user) {
      const { data, error } = await supabase
        .from('meal_captures')
        .insert({
          user_id: user.id,
          source: body.source,
          summary: parsed.summary || 'Meal captured',
          transcript: body.transcript || null,
          image_name: body.imageName || null,
          storage_path: body.storagePath || null,
          provider: nutrition.provider,
          total_calories: nutrition.totalCalories,
          foods: nutrition.foods,
          date_key: body.dateKey || null,
          raw_payload: {
            mealParse: parsed,
            nutrition: nutrition.raw,
            locale: body.locale,
            dateKey: body.dateKey,
          },
        })
        .select('id')
        .single();

      if (!error) savedId = data?.id || null;
    }

    return json({
      status: 'ok',
      provider: nutrition.provider,
      summary: parsed.summary || 'Meal captured',
      totalCalories: nutrition.totalCalories,
      foods: nutrition.foods,
      savedId,
    });
  } catch (error) {
    return json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unexpected edge function error.',
      },
      500,
    );
  }
});
