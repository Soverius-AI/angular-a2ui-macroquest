import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { CopilotChat } from '@copilotkit/angular';
import { MacroQuestStore } from '../application/macroquest.store';
import { getMealTotals } from '../domain/nutrition';
import { DemoMealPlates } from './demo-meal-plates';
import { MacroDashboard } from './macro-dashboard';
import { MealTimeline } from './meal-timeline';
import { MealWorkbench } from './meal-workbench';

@Component({
  selector: 'mq-shell',
  imports: [CopilotChat, DemoMealPlates, MacroDashboard, MealTimeline, MealWorkbench],
  templateUrl: './macroquest-shell.html',
})
export class MacroQuestShell {
  protected readonly chat = viewChild(CopilotChat);

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
