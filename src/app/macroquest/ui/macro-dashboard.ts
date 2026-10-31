import { Component, computed, input, output } from '@angular/core';
import { MacroGoals, MacroKind, MacroTotals, MealEntry } from '../domain/macroquest.models';
import { getGoalPercent, getMealTotals } from '../domain/nutrition';
import { A2uiStepPlayer } from './a2ui-step-player';

interface MacroCard {
  kind: MacroKind;
  label: string;
  value: string;
  remaining: string;
  percent: number;
}

@Component({
  selector: 'mq-dashboard',
  imports: [A2uiStepPlayer],
  templateUrl: './macro-dashboard.html',
})
export class MacroDashboard {
  readonly goals = input.required<MacroGoals>();
  readonly totals = input.required<MacroTotals>();
  readonly remaining = input.required<MacroTotals>();
  readonly questProgress = input.required<number>();
  readonly macroScore = input.required<number>();
  readonly meals = input.required<MealEntry[]>();
  readonly selectedMealId = input.required<string>();
  readonly dayLabel = input.required<string>();

  readonly resetDemo = output<void>();
  readonly mealSelected = output<string>();

  protected readonly ringBackground = computed(
    () => `conic-gradient(#ffffff ${this.questProgress()}%, rgba(255,255,255,0.22) 0)`,
  );

  protected readonly featuredMeal = computed(() => {
    const selectedId = this.selectedMealId();
    if (!selectedId) return undefined;
    return this.meals().find((meal) => meal.id === selectedId);
  });

  protected readonly featuredIndex = computed(() => {
    const meal = this.featuredMeal();
    if (!meal) return -1;
    return this.meals().findIndex((entry) => entry.id === meal.id);
  });

  protected readonly featuredTotals = computed(() => {
    const meal = this.featuredMeal();
    return meal ? getMealTotals(meal) : undefined;
  });

  protected readonly canGoPrevious = computed(() => this.featuredIndex() > 0);

  protected readonly canGoNext = computed(() => {
    const index = this.featuredIndex();
    return index >= 0 && index < this.meals().length - 1;
  });

  protected showPrevious(): void {
    const previous = this.meals()[this.featuredIndex() - 1];
    if (previous) this.mealSelected.emit(previous.id);
  }

  protected showNext(): void {
    const next = this.meals()[this.featuredIndex() + 1];
    if (next) this.mealSelected.emit(next.id);
  }

  protected readonly macroCards = computed<MacroCard[]>(() => {
    const totals = this.totals();
    const remaining = this.remaining();

    return [
      {
        kind: 'calories',
        label: 'Calories',
        value: `${totals.calories}`,
        remaining: `${remaining.calories} kcal left`,
        percent: this.goalPercent('calories'),
      },
      {
        kind: 'protein',
        label: 'Protein',
        value: `${totals.protein}g`,
        remaining: `${remaining.protein}g left`,
        percent: this.goalPercent('protein'),
      },
      {
        kind: 'carbs',
        label: 'Carbs',
        value: `${totals.carbs}g`,
        remaining: `${remaining.carbs}g left`,
        percent: this.goalPercent('carbs'),
      },
      {
        kind: 'fat',
        label: 'Fat',
        value: `${totals.fat}g`,
        remaining: `${remaining.fat}g left`,
        percent: this.goalPercent('fat'),
      },
    ];
  });

  private goalPercent(kind: MacroKind): number {
    return getGoalPercent(this.goals(), this.totals(), kind);
  }
}
