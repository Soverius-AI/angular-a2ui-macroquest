import { DecimalPipe, PercentPipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { MacroTotals, MealEntry, ServingChange } from '../domain/macroquest.models';

@Component({
  selector: 'mq-meal-workbench',
  imports: [DecimalPipe, PercentPipe],
  templateUrl: './meal-workbench.html',
})
export class MealWorkbench {
  readonly meal = input<MealEntry | undefined>();
  readonly totals = input<MacroTotals | undefined>();

  readonly servingsChanged = output<ServingChange>();

  protected updateServings(mealId: string, itemId: string, event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    this.servingsChanged.emit({
      mealId,
      itemId,
      servings: Number(inputElement.value),
    });
  }
}
