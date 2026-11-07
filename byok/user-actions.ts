/**
 * Deterministic handling of A2UI user actions. CopilotKit forwards a surface action as
 * `forwardedProps.a2uiAction.userAction`; the middleware also narrates it to the model as a
 * `log_a2ui_event` exchange, which small and mid-size models often answer with text instead
 * of the tool call the user expects. For actions whose outcome is fully determined by the
 * action's context, the agent calls the frontend tool itself and skips the model turn.
 */
import { mealDraftSchema } from '../contracts/meal-draft-schema';
import type { UserActionHandlers } from './agent';

export const macroQuestUserActions: UserActionHandlers = {
  /** A MealCard "Add to log" click: its context is the meal, as the catalog description asks. */
  add_meal(context) {
    const full = mealDraftSchema.safeParse(context);
    if (full.success) return { tool: 'add_meal_to_log', args: full.data };
    const { title, calories, protein, carbs, fat, note } = context as Record<string, unknown>;
    const single = mealDraftSchema.safeParse({
      title,
      notes: typeof note === 'string' ? note : '',
      items: [
        {
          name: title,
          servingLabel: '1 serving',
          servings: 1,
          calories,
          protein,
          carbs,
          fat,
          confidence: 0.7,
        },
      ],
    });
    return single.success ? { tool: 'add_meal_to_log', args: single.data } : undefined;
  },
};
