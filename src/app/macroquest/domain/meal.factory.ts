import z from 'zod';
import { MealDraft, mealDraftSchema } from '../../../../contracts/meal-draft-schema';
import { FoodItem, MealDraftInput, MealEntry } from './macroquest.models';
import { clamp } from './nutrition';

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeFoodItem(item: FoodItem): FoodItem {
  return {
    ...item,
    id: item.id || createId('food'),
    servings: clamp(Number(item.servings) || 1, 0.1, 6),
    confidence: clamp(Number(item.confidence) || 0.7, 0, 1),
  };
}

export function createMeal(input: MealDraft): MealEntry {
  return {
    id: createId('meal'),
    title: input.title,
    source: 'Agent estimate',
    capturedAt: new Date().toISOString(),
    status: 'draft',
    notes: input.notes ?? 'Review the portions, then confirm.',
    items: input.items.map((item) => normalizeFoodItem({ ...item, id: '' })),
  };
}
