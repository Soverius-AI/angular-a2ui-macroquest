import { z } from 'zod';
import { MacroSwapInput, MealEntry } from '../domain/macroquest.models';
import { getMealTotals } from '../domain/nutrition';

type MacroQuestSandboxStore = {
  applyMacroSwap(input: MacroSwapInput): MealEntry | undefined;
};

let sandboxStore: MacroQuestSandboxStore | undefined;

export const macroSwapSandboxSchema = z.object({
  title: z.string().optional(),
  notes: z.string().optional(),
  strategy: z.string().optional(),
  baseCalories: z.number().nonnegative().optional(),
  baseProtein: z.number().nonnegative().optional(),
  baseCarbs: z.number().nonnegative().optional(),
  baseFat: z.number().nonnegative().optional(),
  calorieMultiplier: z.number().optional(),
  proteinMultiplier: z.number().optional(),
  carbsMultiplier: z.number().optional(),
  fatMultiplier: z.number().optional(),
});

export type MacroSwapSandboxArgs = z.infer<typeof macroSwapSandboxSchema>;

export function connectMacroQuestSandboxStore(store: MacroQuestSandboxStore): void {
  sandboxStore = store;
}

export async function applyMacroSwapFromSandbox(input: MacroSwapSandboxArgs) {
  if (!sandboxStore) {
    const message = 'MacroQuest is not ready yet.';
    return {
      ok: false,
      message,
      error: message,
    };
  }

  const meal = sandboxStore.applyMacroSwap(input);
  if (!meal) {
    const message =
      'This restored swap does not contain source macros. Generate the lighter swap again.';
    return {
      ok: false,
      message,
      error: message,
    };
  }

  return {
    ok: true,
    mealId: meal.id,
    title: meal.title,
    totals: getMealTotals(meal),
  };
}
