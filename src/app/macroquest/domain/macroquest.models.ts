export type MealStatus = 'draft' | 'confirmed';

export type MacroKind = 'calories' | 'protein' | 'carbs' | 'fat';

export interface MacroGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MacroTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface FoodItem {
  id: string;
  name: string;
  servingLabel: string;
  servings: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
}

export interface MealEntry {
  id: string;
  title: string;
  source: string;
  capturedAt: string;
  status: MealStatus;
  notes: string;
  items: FoodItem[];
}

export interface MealDraftInput {
  title: string;
  source?: string;
  notes?: string;
  items: FoodItem[];
}

export interface ServingChange {
  mealId: string;
  itemId: string;
  servings: number;
}

export interface MacroSwapInput {
  title?: string;
  notes?: string;
  strategy?: string;
  baseCalories?: number;
  baseProtein?: number;
  baseCarbs?: number;
  baseFat?: number;
  calorieMultiplier?: number;
  proteinMultiplier?: number;
  carbsMultiplier?: number;
  fatMultiplier?: number;
}

export interface MacroQuestState {
  activeDate: string;
  selectedMealId: string;
  goals: MacroGoals;
  meals: MealEntry[];
  analysisStatus: 'idle' | 'analyzing' | 'ready' | 'error';
}
