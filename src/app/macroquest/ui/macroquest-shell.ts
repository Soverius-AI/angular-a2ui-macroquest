import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CopilotChat } from '@copilotkit/angular';
import { MacroQuestStore } from '../application/macroquest.store';
import { getMealTotals } from '../domain/nutrition';
import { MacroDashboard } from './macro-dashboard';
import { MealTimeline } from './meal-timeline';
import { MealWorkbench } from './meal-workbench';

@Component({
  selector: 'mq-shell',
  imports: [CopilotChat, MacroDashboard, MealTimeline, MealWorkbench],
  templateUrl: './macroquest-shell.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MacroQuestShell {
  protected readonly store = inject(MacroQuestStore);

  protected readonly showMealModal = signal(false);

  protected readonly selectedMealTotals = computed(() => {
    const meal = this.store.selectedMeal();
    return meal ? getMealTotals(meal) : undefined;
  });

  protected confirmAndClose(mealId: string): void {
    this.store.confirmMeal(mealId);
    this.showMealModal.set(false);
  }
}
