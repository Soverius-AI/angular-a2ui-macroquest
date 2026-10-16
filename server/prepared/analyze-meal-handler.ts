/**
 * Meal draft only. The model estimates foods and per-serving macros.
 * It does not build an A2UI card and it does not save the meal.
 */
import { z } from 'zod';
import { modelApiKey, modelBaseUrl, modelName } from '../config';
import { mealDraftSchema } from '../../contracts/meal-draft-schema';
import { showMealAnalysis } from '../meal-analysis-activity';

export type ToolExecutionOptions = {
  messages: Array<{ role: string; content?: unknown }>;
  abortSignal?: AbortSignal;
};

export async function analyzeMealToolHandler(description: string, context?: ToolExecutionOptions) {
  const image = handleImage(context);
  if (!image) {
    return {
      ok: false,
      error: 'No photo is attached to the latest message. Ask the user to attach one.',
    };
  }

  const content: Array<Record<string, unknown>> = [
    {
      type: 'text',
      text: `Estimate this meal. Calories, protein, carbs, and fat are per serving. Return title, notes, and items only.\n${description}`,
    },
    {
      type: 'image_url',
      image_url: { url: `data:${image.mediaType};base64,${image.image}` },
    },
  ];

  showMealAnalysis('Parsing the image', 'sending');
  const response = await fetchAnalysis(content, context);
  showMealAnalysis('Estimating the nutritions...', 'sending');

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return {
    ok: true,
    isEstimate: true,
    source: 'Photo estimate',
    ...mealDraftSchema.parse(JSON.parse(payload.choices?.[0]?.message?.content ?? 'null')),
  };
}

function handleImage(context?: ToolExecutionOptions) {
  const latest = context?.messages?.findLast((message) => message.role === 'user');
  return Array.isArray(latest?.content)
    ? latest.content.find(
        (part): part is { image: unknown; mediaType?: string } =>
          typeof part === 'object' && part !== null && 'image' in part,
      )
    : undefined;
}

async function fetchAnalysis(
  content: Array<Record<string, unknown>>,
  context?: ToolExecutionOptions,
) {
  const response = await fetch(`${modelBaseUrl}/chat/completions`, {
    method: 'POST',
    signal: context?.abortSignal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${modelApiKey}` },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'meal_draft',
          strict: true,
          schema: z.toJSONSchema(mealDraftSchema),
        },
      },
      max_tokens: 2048,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Meal analysis could not complete (HTTP ${response.status}). No meal was saved.`,
    );
  }

  return response;
}
