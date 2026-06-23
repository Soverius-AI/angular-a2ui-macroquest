import { Component, computed, input, output } from '@angular/core';
import { MacroGoals, MacroKind, MacroTotals } from '../domain/macroquest.models';
import { getGoalPercent } from '../domain/nutrition';

interface MacroCard {
  kind: MacroKind;
  label: string;
  value: string;
  remaining: string;
  percent: number;
}

@Component({
  selector: 'mq-dashboard',
  templateUrl: './macro-dashboard.html',
})
export class MacroDashboard {
  readonly goals = input.required<MacroGoals>();
  readonly totals = input.required<MacroTotals>();
  readonly remaining = input.required<MacroTotals>();
  readonly questProgress = input.required<number>();
  readonly macroScore = input.required<number>();

  readonly analyzeSampleMeal = output<void>();
  readonly resetDemo = output<void>();

  protected readonly ringBackground = computed(
    () =>
      `conic-gradient(#ffffff ${this.questProgress()}%, rgba(255,255,255,0.22) 0)`,
  );

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
