import { FoodItem, MacroGoals, MacroKind, MacroTotals, MealEntry } from './macroquest.models';

export const emptyMacroTotals = (): MacroTotals => ({
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
});

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getFoodItemTotals(item: FoodItem): MacroTotals {
  return {
    calories: item.calories * item.servings,
    protein: item.protein * item.servings,
    carbs: item.carbs * item.servings,
    fat: item.fat * item.servings,
  };
}

export function addMacroTotals(a: MacroTotals, b: MacroTotals): MacroTotals {
  return {
    calories: a.calories + b.calories,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  };
}

export function roundMacroTotals(totals: MacroTotals): MacroTotals {
  return {
    calories: Math.round(totals.calories),
    protein: Math.round(totals.protein),
    carbs: Math.round(totals.carbs),
    fat: Math.round(totals.fat),
  };
}

export function getMealTotals(meal: MealEntry): MacroTotals {
  return roundMacroTotals(
    meal.items.map(getFoodItemTotals).reduce(addMacroTotals, emptyMacroTotals()),
  );
}

export function getMealsForDate(meals: MealEntry[], activeDate: string): MealEntry[] {
  return meals.filter((meal) => meal.capturedAt.slice(0, 10) === activeDate);
}

export function getDailyTotals(meals: MealEntry[], activeDate: string): MacroTotals {
  return roundMacroTotals(
    getMealsForDate(meals, activeDate)
      .map(getMealTotals)
      .reduce(addMacroTotals, emptyMacroTotals()),
  );
}

export function getRemainingMacros(goals: MacroGoals, totals: MacroTotals): MacroTotals {
  return {
    calories: Math.max(0, goals.calories - totals.calories),
    protein: Math.max(0, goals.protein - totals.protein),
    carbs: Math.max(0, goals.carbs - totals.carbs),
    fat: Math.max(0, goals.fat - totals.fat),
  };
}

export function getGoalPercent(goals: MacroGoals, totals: MacroTotals, kind: MacroKind): number {
  if (goals[kind] <= 0) return 0;
  return Math.min(100, Math.round((totals[kind] / goals[kind]) * 100));
}

export function getQuestProgress(goals: MacroGoals, totals: MacroTotals): number {
  const protein = goals.protein > 0 ? clamp(totals.protein / goals.protein, 0, 1) : 0;
  const calories = goals.calories > 0 ? clamp(totals.calories / goals.calories, 0, 1) : 0;
  return Math.round((protein * 0.6 + calories * 0.4) * 100);
}

export function getMacroScore(goals: MacroGoals, totals: MacroTotals): number {
  const proteinDelta =
    goals.protein > 0 ? Math.abs(goals.protein - totals.protein) / goals.protein : 1;
  const calorieDelta =
    goals.calories > 0 ? Math.abs(goals.calories - totals.calories) / goals.calories : 1;

  return Math.round(clamp(100 - (proteinDelta + calorieDelta) * 50, 0, 100));
}
