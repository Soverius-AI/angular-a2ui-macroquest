import z from 'zod';

export const mealDraftSchema = z.object({
  title: z.string().min(1),
  notes: z.string(),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        servingLabel: z.string().min(1),
        servings: z.number().positive(),
        calories: z.number().nonnegative(),
        protein: z.number().nonnegative(),
        carbs: z.number().nonnegative(),
        fat: z.number().nonnegative(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .min(1),
});

export type MealDraft = z.infer<typeof mealDraftSchema>;
