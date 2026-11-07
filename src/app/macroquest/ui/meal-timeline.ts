import { Component, input, output, signal } from '@angular/core';
import { FoodItemEdit, MealEntry, ServingChange } from '../domain/macroquest.models';
import { getMealTotals } from '../domain/nutrition';
import { MealWorkbench } from './meal-workbench';

@Component({
  selector: 'mq-meal-timeline',
  imports: [MealWorkbench],
  templateUrl: './meal-timeline.html',
})
export class MealTimeline {
  readonly meals = input.required<MealEntry[]>();
  readonly dayLabel = input.required<string>();
  readonly canGoNextDay = input.required<boolean>();

  readonly mealSelected = output<string>();
  readonly servingsChanged = output<ServingChange>();
  readonly titleChanged = output<{ mealId: string; title: string }>();
  readonly itemEdited = output<FoodItemEdit>();
  readonly mealConfirmed = output<string>();
  readonly previousDay = output<void>();
  readonly nextDay = output<void>();

  protected readonly expandedMealId = signal<string | null>(null);

  protected mealTotals(meal: MealEntry) {
    return getMealTotals(meal);
  }

  protected toggleMeal(mealId: string): void {
    const expanded = this.expandedMealId() === mealId ? null : mealId;
    this.expandedMealId.set(expanded);
    if (expanded) this.mealSelected.emit(expanded);
  }
}
