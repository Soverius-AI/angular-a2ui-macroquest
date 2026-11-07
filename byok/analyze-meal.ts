/**
 * Browser counterpart of server/prepared/analyze-meal-handler.ts. Like the server, the tool
 * looks at the photo attached to the latest user message; without one it estimates from
 * the model's description of the meal.
 */
import { EventType, type BaseEvent, type Message } from '@ag-ui/core';
import { z } from 'zod';
import { analyzeMealToolName } from '../contracts/macroquest-agent';
import { mealDraftSchema } from '../contracts/meal-draft-schema';
import {
  mealAnalysisActivityType,
  mealAnalysisMessageId,
} from '../contracts/meal-analysis-activity';
import type { LocalTool } from './agent';
import type { ImageInput, ModelClient } from './model-client';

/** A photo-only question has nothing to describe; the model may leave the description empty. */
const parameters = z.object({ description: z.string().optional() });

function activity(title: string, phase: 'sending' | 'ready' | 'error'): BaseEvent {
  return {
    type: EventType.ACTIVITY_SNAPSHOT,
    messageId: mealAnalysisMessageId,
    activityType: mealAnalysisActivityType,
    content: { title, phase },
  } as BaseEvent;
}

/** The AG-UI image part of the latest user message, when it carries inline data. */
export function latestUserImage(messages: Message[]): ImageInput | undefined {
  const latest = [...messages].reverse().find((message) => message.role === 'user');
  if (!latest || !Array.isArray(latest.content)) return undefined;
  for (const part of latest.content as {
    type?: string;
    source?: { type?: string; value?: string; mimeType?: string };
  }[]) {
    if (
      part.type === 'image' &&
      part.source?.type === 'data' &&
      typeof part.source.value === 'string' &&
      part.source.value &&
      typeof part.source.mimeType === 'string'
    )
      return { mimeType: part.source.mimeType, data: part.source.value };
  }
  return undefined;
}

export function createAnalyzeMealTool(client: ModelClient): LocalTool {
  return {
    definition: {
      type: 'function',
      function: {
        name: analyzeMealToolName,
        description:
          'Analyze the meal from the photo attached to the latest message, or from the description when there is no photo, and return the nutrition in the form of calories, carbs, fat, etc.',
        parameters: z.toJSONSchema(parameters) as Record<string, unknown>,
      },
    },
    async *execute(args, context) {
      const description = parameters.parse(args).description?.trim() ?? '';
      const image = latestUserImage(context.messages);
      if (!image && !description)
        return {
          ok: false,
          error: 'No photo is attached and no meal was described. Ask the user for one.',
        };
      yield activity(
        image ? 'Processing the image...' : 'Estimating from your description...',
        'sending',
      );
      try {
        const meal = await client.completeJson({
          prompt: `Estimate this meal. Calories, protein, carbs, and fat are per serving. Return title, notes, and items only.\n${description}`,
          schema: z.toJSONSchema(mealDraftSchema) as Record<string, unknown>,
          parser: mealDraftSchema,
          image,
          maxTokens: 2048,
          abortSignal: context.abortSignal,
        });
        yield activity('Analysis complete', 'ready');
        return {
          ok: true,
          isEstimate: true,
          source: image ? 'Photo estimate' : 'Estimate from the description',
          ...meal,
          next: 'Show the user a MealCard with these totals and an "add_meal" action so one click logs it.',
        };
      } catch (error) {
        yield activity('Analysis failed', 'error');
        throw error;
      }
    },
  };
}
