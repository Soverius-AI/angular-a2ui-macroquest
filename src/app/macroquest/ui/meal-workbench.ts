import { PercentPipe } from '@angular/common';
import { Component, input, output, signal } from '@angular/core';
import {
  FoodItem,
  FoodItemEdit,
  MacroTotals,
  MealEntry,
  ServingChange,
} from '../domain/macroquest.models';

@Component({
  selector: 'mq-meal-workbench',
  imports: [PercentPipe],
  templateUrl: './meal-workbench.html',
})
export class MealWorkbench {
  protected readonly macroFields = [
    { key: 'calories', label: 'Calories', unit: 'kcal', step: '1' },
    { key: 'protein', label: 'Protein', unit: 'g', step: '0.1' },
    { key: 'carbs', label: 'Carbs', unit: 'g', step: '0.1' },
    { key: 'fat', label: 'Fat', unit: 'g', step: '0.1' },
  ] as const;
  readonly meal = input<MealEntry | undefined>();
  readonly totals = input<MacroTotals | undefined>();

  readonly servingsChanged = output<ServingChange>();
  readonly titleChanged = output<{ mealId: string; title: string }>();
  readonly itemEdited = output<FoodItemEdit>();

  protected readonly editingTitle = signal(false);
  protected readonly editingItemId = signal<string | null>(null);

  protected toggleTitle(): void {
    this.editingTitle.update((editing) => !editing);
  }

  protected toggleItem(itemId: string): void {
    this.editingItemId.update((current) => (current === itemId ? null : itemId));
  }

  protected updateTitle(mealId: string, event: Event): void {
    this.titleChanged.emit({
      mealId,
      title: (event.target as HTMLInputElement).value,
    });
  }

  protected updateName(mealId: string, itemId: string, event: Event): void {
    this.itemEdited.emit({
      mealId,
      itemId,
      name: (event.target as HTMLInputElement).value,
    });
  }

  protected lineAmount(item: FoodItem, key: 'calories' | 'protein' | 'carbs' | 'fat'): number {
    const amount = item[key] * item.servings;
    return key === 'calories' ? Math.round(amount) : Math.round(amount * 10) / 10;
  }

  protected updateMacro(
    mealId: string,
    itemId: string,
    servings: number,
    key: 'calories' | 'protein' | 'carbs' | 'fat',
    event: Event,
  ): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    const perServing = servings > 0 ? value / servings : value;
    this.itemEdited.emit({ mealId, itemId, [key]: Math.max(0, perServing) });
  }

  protected updateServings(mealId: string, itemId: string, event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    this.servingsChanged.emit({
      mealId,
      itemId,
      servings: Number(inputElement.value),
    });
  }
}
