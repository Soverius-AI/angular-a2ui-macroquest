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

export function createMeal(input: MealDraftInput): MealEntry {
  return {
    id: createId('meal'),
    title: input.title,
    source: input.source ?? 'Agent estimate',
    capturedAt: new Date().toISOString(),
    status: 'draft',
    notes: input.notes ?? 'Review portions before confirming.',
    items: input.items.map(normalizeFoodItem),
  };
}
