import { computed } from '@angular/core';
import {
  patchState,
  signalStoreFeature,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { createMeal } from '../../domain/meal.factory';
import {
  MacroGoals,
  MacroQuestState,
  MacroSwapInput,
  MealDraftInput,
  MealEntry,
  ServingChange,
} from '../../domain/macroquest.models';
import {
  clamp,
  getDailyTotals,
  getMacroScore,
  getMealsForDate,
  getQuestProgress,
  getRemainingMacros,
} from '../../domain/nutrition';
import { createSampleMeal } from '../../domain/sample-meals';

const initialState: MacroQuestState = {
  activeDate: new Date().toISOString().slice(0, 10),
  selectedMealId: '',
  goals: {
    calories: 2100,
    protein: 150,
    carbs: 210,
    fat: 70,
  },
  meals: [],
  analysisStatus: 'idle',
};

/** Core domain feature: the meal log, the daily goals and their derived signals. */
export function withMacroQuest() {
  return signalStoreFeature(
    withState(initialState),
    withComputed((store) => ({
      activeMeals: computed(() => getMealsForDate(store.meals(), store.activeDate())),
      selectedMeal: computed(() =>
        store.meals().find((meal) => meal.id === store.selectedMealId()),
      ),
      dailyTotals: computed(() => getDailyTotals(store.meals(), store.activeDate())),
    })),
    withComputed((store) => ({
      remaining: computed(() => getRemainingMacros(store.goals(), store.dailyTotals())),
      questProgress: computed(() => getQuestProgress(store.goals(), store.dailyTotals())),
      macroScore: computed(() => getMacroScore(store.goals(), store.dailyTotals())),
    })),
    withMethods((store) => ({
      analyzeSampleMeal(): MealEntry {
        const meal = createMeal(createSampleMeal());
        patchState(store, (state) => ({
          meals: [meal, ...state.meals],
          selectedMealId: meal.id,
          analysisStatus: 'ready' as const,
        }));
        return meal;
      },
      applyMealDraft(input: MealDraftInput): MealEntry {
        const meal = createMeal(input);
        patchState(store, (state) => ({
          meals: [meal, ...state.meals],
          selectedMealId: meal.id,
          analysisStatus: 'ready' as const,
        }));
        return meal;
      },
      applyMacroSwap(input: MacroSwapInput): MealEntry | undefined {
        const selectedMeal =
          store.meals().find((meal) => meal.id === store.selectedMealId()) ??
          store.activeMeals()[0] ??
          store.meals()[0];
        const hasEmbeddedSourceMacros =
          Number(input.baseCalories) > 0 ||
          Number(input.baseProtein) > 0 ||
          Number(input.baseCarbs) > 0 ||
          Number(input.baseFat) > 0;
        if (!selectedMeal && !hasEmbeddedSourceMacros) return undefined;

        const sourceMeal =
          selectedMeal ??
          createMeal({
            title: input.title?.trim() || 'Generated macro swap',
            source: 'Open Generative UI sandbox',
            notes: 'Restored from the source macros embedded in the generated sandbox action.',
            items: [
              {
                id: '',
                name: input.title?.trim() || 'Generated meal',
                servingLabel: '1 meal',
                servings: 1,
                calories: Math.max(0, Number(input.baseCalories) || 0),
                protein: Math.max(0, Number(input.baseProtein) || 0),
                carbs: Math.max(0, Number(input.baseCarbs) || 0),
                fat: Math.max(0, Number(input.baseFat) || 0),
                confidence: 0.7,
              },
            ],
          });

        const calorieMultiplier = clamp(Number(input.calorieMultiplier ?? 0.72), 0.2, 1.4);
        const proteinMultiplier = clamp(Number(input.proteinMultiplier ?? 1), 0.2, 1.6);
        const carbsMultiplier = clamp(Number(input.carbsMultiplier ?? 0.55), 0.1, 1.4);
        const fatMultiplier = clamp(Number(input.fatMultiplier ?? 0.7), 0.1, 1.4);
        const updatedMeal: MealEntry = {
          ...sourceMeal,
          title: input.title?.trim() || `Lighter ${sourceMeal.title}`,
          source: 'Open Generative UI sandbox',
          notes:
            input.notes?.trim() ||
            'Sandbox-generated lighter swap applied directly from the generated UI.',
          status: 'draft',
          items: sourceMeal.items.map((item) => ({
            ...item,
            calories: Math.max(0, Math.round(item.calories * calorieMultiplier)),
            protein: Math.max(0, Math.round(item.protein * proteinMultiplier)),
            carbs: Math.max(0, Math.round(item.carbs * carbsMultiplier)),
            fat: Math.max(0, Math.round(item.fat * fatMultiplier)),
            confidence: Math.min(1, Math.max(item.confidence, 0.7)),
          })),
        };

        patchState(store, (state) => ({
          meals: state.meals.some((meal) => meal.id === updatedMeal.id)
            ? state.meals.map((meal) => (meal.id === updatedMeal.id ? updatedMeal : meal))
            : [updatedMeal, ...state.meals],
          selectedMealId: updatedMeal.id,
          analysisStatus: 'ready' as const,
        }));

        return updatedMeal;
      },
      updateServings({ mealId, itemId, servings }: ServingChange): void {
        const safeServings = clamp(Number(servings) || 1, 0.1, 6);
        patchState(store, (state) => ({
          meals: state.meals.map((meal) =>
            meal.id !== mealId
              ? meal
              : {
                  ...meal,
                  items: meal.items.map((item) =>
                    item.id === itemId ? { ...item, servings: safeServings } : item,
                  ),
                },
          ),
        }));
      },
      confirmMeal(mealId: string): void {
        patchState(store, (state) => ({
          meals: state.meals.map((meal) =>
            meal.id === mealId ? { ...meal, status: 'confirmed' } : meal,
          ),
          selectedMealId: mealId,
        }));
      },
      selectMeal(mealId: string): void {
        patchState(store, { selectedMealId: mealId });
      },
      setGoals(goals: Partial<MacroGoals>): void {
        patchState(store, (state) => ({
          goals: {
            ...state.goals,
            ...goals,
          },
        }));
      },
      resetDemo(): void {
        patchState(store, {
          meals: [],
          selectedMealId: '',
          analysisStatus: 'idle',
        });
      },
    })),
  );
}
