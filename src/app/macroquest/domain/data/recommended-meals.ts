import z from 'zod';

export const recommendedMealSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  reason: z.string().min(1),
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative(),
});

export type RecommendedMeal = z.infer<typeof recommendedMealSchema>;

/** Typical single servings. Numbers are rounded estimates, not a lab analysis. */
export const wienerSchnitzel: RecommendedMeal = {
  id: 'wiener-schnitzel',
  title: 'Wiener Schnitzel',
  reason: 'A breaded veal cutlet, enough for a full meal.',
  calories: 620,
  protein: 36,
  carbs: 24,
  fat: 40,
};

export const sachertorte: RecommendedMeal = {
  id: 'sachertorte',
  title: 'Sachertorte',
  reason: 'One slice of chocolate cake with apricot jam.',
  calories: 420,
  protein: 6,
  carbs: 46,
  fat: 23,
};

export const kaesenockerl: RecommendedMeal = {
  id: 'kaesenockerl',
  title: 'Käsenockerl',
  reason: 'Cheese noodles, heavy on protein and carbs.',
  calories: 740,
  protein: 32,
  carbs: 68,
  fat: 36,
};

export const topfenstrudel: RecommendedMeal = {
  id: 'topfenstrudel',
  title: 'Topfenstrudel',
  reason: 'A slice of quark strudel, lighter than the chocolate cake.',
  calories: 360,
  protein: 10,
  carbs: 42,
  fat: 16,
};

export const tafelspitz: RecommendedMeal = {
  id: 'tafelspitz',
  title: 'Tafelspitz',
  reason: 'Boiled beef with broth, potato, and horseradish.',
  calories: 450,
  protein: 42,
  carbs: 16,
  fat: 22,
};

export const kaiserschmarrn: RecommendedMeal = {
  id: 'kaiserschmarrn',
  title: 'Kaiserschmarrn',
  reason: 'Shredded pancake with raisins and powdered sugar.',
  calories: 540,
  protein: 15,
  carbs: 66,
  fat: 22,
};

export const frankfurterMitSemmel: RecommendedMeal = {
  id: 'frankfurter-semmel',
  title: 'Frankfurter mit Semmel',
  reason: 'A sausage in a roll, a small add-on rather than dinner.',
  calories: 390,
  protein: 16,
  carbs: 34,
  fat: 20,
};

export const almdudler: RecommendedMeal = {
  id: 'almdudler',
  title: 'Almdudler',
  reason: 'A 330 ml bottle of herbal soda.',
  calories: 110,
  protein: 0,
  carbs: 27,
  fat: 0,
};

export const wienerMelange: RecommendedMeal = {
  id: 'wiener-melange',
  title: 'Wiener Melange',
  reason: 'Coffee with hot milk.',
  calories: 80,
  protein: 4,
  carbs: 6,
  fat: 4,
};

export const gespritzter: RecommendedMeal = {
  id: 'gespritzter',
  title: 'Gespritzter',
  reason: 'A quarter litre of white wine with soda.',
  calories: 70,
  protein: 0,
  carbs: 3,
  fat: 0,
};

export const recommendedMeals: readonly RecommendedMeal[] = z.array(recommendedMealSchema).parse([
  wienerSchnitzel,
  sachertorte,
  kaesenockerl,
  topfenstrudel,
  tafelspitz,
  kaiserschmarrn,
  frankfurterMitSemmel,
  almdudler,
  wienerMelange,
  gespritzter,
]);
