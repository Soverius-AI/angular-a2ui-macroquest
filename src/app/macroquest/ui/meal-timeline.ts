import { Component, input, output } from '@angular/core';
import { MealEntry } from '../domain/macroquest.models';
import { getMealTotals } from '../domain/nutrition';

@Component({
  selector: 'mq-meal-timeline',
  templateUrl: './meal-timeline.html',
})
export class MealTimeline {
  readonly meals = input.required<MealEntry[]>();
  readonly selectedMealId = input.required<string>();

  readonly mealSelected = output<string>();

  protected mealTotals(meal: MealEntry) {
    return getMealTotals(meal);
  }
}
