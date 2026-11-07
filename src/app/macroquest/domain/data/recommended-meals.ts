import { MealDraft, mealDraftSchema } from '../../../../../contracts/meal-draft-schema';

/** Typical single servings. Numbers are rounded estimates, not a lab analysis. */
export const wienerSchnitzel: MealDraft = {
  title: 'Wiener Schnitzel',
  notes: 'A breaded veal cutlet, enough for a full meal.',
  items: [
    {
      name: 'Wiener Schnitzel',
      servingLabel: '1 cutlet',
      servings: 1,
      calories: 620,
      protein: 36,
      carbs: 24,
      fat: 40,
      confidence: 1,
    },
  ],
};

export const sachertorte: MealDraft = {
  title: 'Sachertorte',
  notes: 'One slice of chocolate cake with apricot jam.',
  items: [
    {
      name: 'Sachertorte',
      servingLabel: '1 slice',
      servings: 1,
      calories: 420,
      protein: 6,
      carbs: 46,
      fat: 23,
      confidence: 1,
    },
  ],
};

export const kaesenockerl: MealDraft = {
  title: 'Käsenockerl',
  notes: 'Cheese noodles, heavy on protein and carbs.',
  items: [
    {
      name: 'Käsenockerl',
      servingLabel: '1 plate',
      servings: 1,
      calories: 740,
      protein: 32,
      carbs: 68,
      fat: 36,
      confidence: 1,
    },
  ],
};

export const topfenstrudel: MealDraft = {
  title: 'Topfenstrudel',
  notes: 'A slice of quark strudel, lighter than the chocolate cake.',
  items: [
    {
      name: 'Topfenstrudel',
      servingLabel: '1 slice',
      servings: 1,
      calories: 360,
      protein: 10,
      carbs: 42,
      fat: 16,
      confidence: 1,
    },
  ],
};

export const tafelspitz: MealDraft = {
  title: 'Tafelspitz',
  notes: 'Boiled beef with broth, potato, and horseradish.',
  items: [
    {
      name: 'Tafelspitz',
      servingLabel: '1 plate',
      servings: 1,
      calories: 450,
      protein: 42,
      carbs: 16,
      fat: 22,
      confidence: 1,
    },
  ],
};

export const kaiserschmarrn: MealDraft = {
  title: 'Kaiserschmarrn',
  notes: 'Shredded pancake with raisins and powdered sugar.',
  items: [
    {
      name: 'Kaiserschmarrn',
      servingLabel: '1 plate',
      servings: 1,
      calories: 540,
      protein: 15,
      carbs: 66,
      fat: 22,
      confidence: 1,
    },
  ],
};

export const frankfurter: MealDraft = {
  title: 'Frankfurter',
  notes: 'A sausage in a roll, a small add-on rather than dinner.',
  items: [
    {
      name: 'Frankfurter',
      servingLabel: '1 sausage with a roll',
      servings: 1,
      calories: 390,
      protein: 16,
      carbs: 34,
      fat: 20,
      confidence: 1,
    },
  ],
};

export const almdudler: MealDraft = {
  title: 'Almdudler',
  notes: 'A 330 ml bottle of herbal soda.',
  items: [
    {
      name: 'Almdudler',
      servingLabel: '330 ml',
      servings: 1,
      calories: 110,
      protein: 0,
      carbs: 27,
      fat: 0,
      confidence: 1,
    },
  ],
};

export const melange: MealDraft = {
  title: 'Melange',
  notes: 'Coffee with hot milk.',
  items: [
    {
      name: 'Melange',
      servingLabel: '1 cup',
      servings: 1,
      calories: 80,
      protein: 4,
      carbs: 6,
      fat: 4,
      confidence: 1,
    },
  ],
};

export const gespritzter: MealDraft = {
  title: 'Gespritzter',
  notes: 'A quarter litre of white wine with soda.',
  items: [
    {
      name: 'Gespritzter',
      servingLabel: '250 ml',
      servings: 1,
      calories: 70,
      protein: 0,
      carbs: 3,
      fat: 0,
      confidence: 1,
    },
  ],
};

export const recommendedMeals: readonly MealDraft[] = mealDraftSchema
  .array()
  .parse([
    wienerSchnitzel,
    sachertorte,
    kaesenockerl,
    topfenstrudel,
    tafelspitz,
    kaiserschmarrn,
    frankfurter,
    melange,
  ]);
