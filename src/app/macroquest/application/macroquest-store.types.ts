import { Signal } from '@angular/core';
import {
  FoodItem,
  MacroGoals,
  MacroQuestState,
  MacroSwapInput,
  MacroTotals,
  MealDraftInput,
  MealEntry,
} from '../domain/macroquest.models';

export type FoodItemToolArgs = Omit<FoodItem, 'id'> & { id?: string };

export type MealDraftToolArgs = {
  title: string;
  source?: string;
  notes?: string;
  items: FoodItemToolArgs[];
} & Record<string, unknown>;

export type MacroGoalsToolArgs = Partial<MacroGoals> & Record<string, unknown>;

export type MacroQuestStateSlice = Pick<MacroQuestState, 'activeDate' | 'goals'>;

export interface MacroQuestDerivedSignals {
  dailyTotals: Signal<MacroTotals>;
  remaining: Signal<MacroTotals>;
  selectedMeal: Signal<MealEntry | undefined>;
}

/**
 * Declared as a `type`, not an `interface`, so it keeps an implicit index
 * signature and stays assignable to NgRx's `MethodsDictionary` when used as a
 * `signalStoreFeature` input.
 */
export type MacroQuestMethods = {
  applyMealDraft(input: MealDraftInput): MealEntry;
  applyMacroSwap(input: MacroSwapInput): MealEntry | undefined;
  setGoals(goals: Partial<MacroGoals>): void;
};
