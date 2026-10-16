import { HttpClient } from '@angular/common/http';
import { Service, computed, inject, signal } from '@angular/core';
import {
  connectAgentContext,
  registerFrontendTool,
  registerHumanInTheLoop,
  registerRenderActivityMessage,
  type AttachmentsConfig,
} from '@copilotkit/angular';
import { take } from 'rxjs';
import { MealDraft, mealDraftSchema } from '../../../../contracts/meal-draft-schema';
import { FriendDayLog } from '../domain/friend-day';
import {
  FoodItemEdit,
  MacroGoals,
  MacroQuestState,
  MealEntry,
  ServingChange,
} from '../domain/macroquest.models';
import { createMeal } from '../domain/meal.factory';
import {
  clamp,
  getDailyTotals,
  getMacroScore,
  getMealsForDate,
  getMealTotals,
  getQuestProgress,
  getRemainingMacros,
} from '../domain/nutrition';
import {
  capturedAtForDayOffset,
  formatQuestDay,
  questDate,
  shiftQuestDate,
} from '../domain/quest-day';
import { mealLogUrl } from './mock-meals.interceptor';
import z from 'zod';
import { MealAnalysisActivity, mealAnalysisActivityContent } from '../ui/meal-analysis-activity';
import { MealDraftConfirmation } from '../ui/meal-draft-confirmation';

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

/**
 * The meal log. One writable signal holds the state. Everything the screen
 * reads is derived from it.
 */
@Service()
export class MacroQuestStore {
  private readonly http = inject(HttpClient);
  private readonly state = signal(initialState);

  // state slices
  readonly activeDate = computed(() => this.state().activeDate);
  readonly selectedMealId = computed(() => this.state().selectedMealId);
  readonly goals = computed(() => this.state().goals);
  readonly meals = computed(() => this.state().meals);

  // computeds
  readonly activeMeals = computed(() => getMealsForDate(this.meals(), this.activeDate()));
  readonly selectedMeal = computed(() =>
    this.meals().find((meal) => meal.id === this.selectedMealId()),
  );
  readonly dailyTotals = computed(() => getDailyTotals(this.meals(), this.activeDate()));
  readonly remaining = computed(() => getRemainingMacros(this.goals(), this.dailyTotals()));
  readonly questProgress = computed(() => getQuestProgress(this.goals(), this.dailyTotals()));
  readonly macroScore = computed(() => getMacroScore(this.goals(), this.dailyTotals()));
  readonly dayLabel = computed(() => formatQuestDay(this.activeDate()));
  readonly canGoNextDay = computed(() => this.activeDate() < questDate());

  readonly mealPhotoAttachments = {
    enabled: true,
    accept: 'image/png,image/jpeg,image/webp',
    // Demo plates in public/meals include ~10MB JPEGs.
    maxSize: 12 * 1024 * 1024,
  } satisfies AttachmentsConfig;

  constructor() {
    connectAgentContext(() => ({
      description:
        'Trusted MacroQuest state: meal log, active day, selection, goals, and precomputed daily and per-meal totals. Use these exact values in generated UI.',
      value: JSON.stringify({
        ...this.state(),
        dailyTotals: this.dailyTotals(),
        remaining: this.remaining(),
        mealSummaries: this.activeMeals().map((meal) => ({
          title: meal.title,
          totals: getMealTotals(meal),
        })),
      }),
    }));

    registerFrontendTool({
      name: 'show_previous_day',
      description: 'Switch to the previous day',
      parameters: z.object({}),
      handler: async () => this.showPreviousDay(),
    });

    registerFrontendTool({
      name: 'show_next_day',
      description: 'Switch to the next day',
      parameters: z.object({}),
      handler: async () => this.showNextDay(),
    });

    registerHumanInTheLoop({
      name: 'add meal to meal log',
      description: 'Adds a new meal to the current meal log',
      parameters: mealDraftSchema,
      component: MealDraftConfirmation,
    });

    registerRenderActivityMessage({
      activityType: 'meal-analysis',
      content: mealAnalysisActivityContent,
      component: MealAnalysisActivity,
    });

    this.http
      .get<FriendDayLog[]>(mealLogUrl)
      .pipe(take(1))
      .subscribe((days) => this.applyMealLog(days));
  }

  showPreviousDay(): void {
    this.showDay(shiftQuestDate(this.activeDate(), -1));
  }

  showNextDay(): void {
    const next = shiftQuestDate(this.activeDate(), 1);
    if (next > questDate()) return;
    this.showDay(next);
  }

  applyMealDraft(input: MealDraft): MealEntry {
    const meal = createMeal(input);
    this.patchState({
      meals: [meal, ...this.meals()],
      selectedMealId: meal.id,
      activeDate: meal.capturedAt.slice(0, 10),
      analysisStatus: 'ready',
    });
    return meal;
  }

  renameMeal(mealId: string, title: string): void {
    this.patchState({
      meals: this.meals().map((meal) => (meal.id === mealId ? { ...meal, title } : meal)),
    });
  }

  updateFoodItem({ mealId, itemId, name, calories, protein, carbs, fat }: FoodItemEdit): void {
    this.patchState({
      meals: this.meals().map((meal) =>
        meal.id !== mealId
          ? meal
          : {
              ...meal,
              items: meal.items.map((item) => {
                if (item.id !== itemId) return item;
                return {
                  ...item,
                  ...(name !== undefined ? { name } : {}),
                  ...(calories !== undefined ? { calories: Math.max(0, calories) } : {}),
                  ...(protein !== undefined ? { protein: Math.max(0, protein) } : {}),
                  ...(carbs !== undefined ? { carbs: Math.max(0, carbs) } : {}),
                  ...(fat !== undefined ? { fat: Math.max(0, fat) } : {}),
                };
              }),
            },
      ),
    });
  }

  updateServings({ mealId, itemId, servings }: ServingChange): void {
    const safeServings = clamp(Number(servings) || 1, 0.1, 6);
    this.patchState({
      meals: this.meals().map((meal) =>
        meal.id !== mealId
          ? meal
          : {
              ...meal,
              items: meal.items.map((item) =>
                item.id === itemId ? { ...item, servings: safeServings } : item,
              ),
            },
      ),
    });
  }

  confirmMeal(mealId: string): void {
    this.patchState({
      meals: this.meals().map((meal) =>
        meal.id === mealId ? { ...meal, status: 'confirmed' } : meal,
      ),
      selectedMealId: mealId,
    });
  }

  selectMeal(mealId: string): void {
    this.patchState({ selectedMealId: mealId });
  }

  setGoals(goals: Partial<MacroGoals>): void {
    this.patchState({
      goals: {
        ...this.goals(),
        ...goals,
      },
    });
  }

  resetDemo(): void {
    this.patchState({
      meals: [],
      selectedMealId: '',
      activeDate: questDate(),
      analysisStatus: 'idle',
    });
  }

  private applyMealLog(days: readonly FriendDayLog[]): void {
    const today = questDate();
    const meals = days.flatMap((day) =>
      day.meals.map((draft) => ({
        ...createMeal({ ...draft, notes: '' }),
        status: 'confirmed' as const,
        capturedAt: capturedAtForDayOffset(day.dayOffset),
      })),
    );
    const firstToday = meals.find((meal) => meal.capturedAt.slice(0, 10) === today);
    this.patchState({
      meals,
      activeDate: today,
      selectedMealId: firstToday?.id ?? '',
      analysisStatus: 'ready',
    });
  }

  private showDay(activeDate: string): void {
    const firstMeal = this.meals().find((meal) => meal.capturedAt.slice(0, 10) === activeDate);
    this.patchState({
      activeDate,
      selectedMealId: firstMeal?.id ?? '',
    });
  }

  private patchState(patch: Partial<MacroQuestState>): void {
    this.state.update((state) => ({ ...state, ...patch }));
  }
}
