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
    return {
      ok: false,
      message: 'MacroQuest is not ready yet.',
    };
  }

  const meal = sandboxStore.applyMacroSwap(input);
  if (!meal) {
    return {
      ok: false,
      message: 'Analyze or select a meal before applying a sandbox swap.',
    };
  }

  return {
    ok: true,
    mealId: meal.id,
    title: meal.title,
    totals: getMealTotals(meal),
  };
}
