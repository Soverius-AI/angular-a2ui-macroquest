import {
  ActionSchema,
  DynamicNumberSchema,
  DynamicStringSchema,
  createAngularCatalog,
} from '@copilotkit/angular/a2ui';
import z from 'zod3';
import { MealCard } from './meal-card';

/**
 * The A2UI v0.9 basic catalog (CopilotKit's renderer, styled by the `cpk-a2ui-surface`
 * rules in styles.css) extended with MacroQuest's own components. Definitions become
 * part of the catalog schema the client sends, so the model can use them anywhere a
 * surface is rendered: the chat and the main-area Recommended meals section.
 */
export const catalog = createAngularCatalog(
  {
    MealCard: {
      description:
        'A MacroQuest meal suggestion card with a title, calories and macros per serving, an optional photo URL and note, and an optional action whose event name is "add_meal" and whose context carries the same title, calories, protein, carbs and fat so the meal can be logged. Put several MealCards in a Row or List for recommendations.',
      props: z.object({
        title: DynamicStringSchema,
        calories: DynamicNumberSchema,
        protein: DynamicNumberSchema,
        carbs: DynamicNumberSchema,
        fat: DynamicNumberSchema,
        image: DynamicStringSchema.optional(),
        note: DynamicStringSchema.optional(),
        action: ActionSchema.optional(),
      }),
    },
  },
  { MealCard },
  { includeBasicCatalog: true },
);
