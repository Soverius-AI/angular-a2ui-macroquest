import { computed } from '@angular/core';
import {
  type AttachmentsConfig,
  connectAgentContext,
  registerFrontendTool,
} from '@copilotkit/angular';
import { signalStoreFeature, type, withHooks, withProps } from '@ngrx/signals';
import { z } from 'zod';
import { FoodItem } from '../../domain/macroquest.models';
import { getMealTotals } from '../../domain/nutrition';
import { connectMacroQuestSandboxStore } from '../macroquest-sandbox';
import {
  MacroGoalsToolArgs,
  MacroQuestDerivedSignals,
  MacroQuestMethods,
  MacroQuestStateSlice,
  MealDraftToolArgs,
} from '../macroquest-store.types';

/**
 * Registers the CopilotKit agent context and frontend tools against the store.
 * Must be composed after {@link withMacroQuest}, whose state/methods it reads;
 * the `onInit` hook supplies the injection context the CopilotKit `connect*`/
 * `register*` helpers require.
 */
export function withCopilotKit() {
  return signalStoreFeature(
    {
      state: type<MacroQuestStateSlice>(),
      props: type<MacroQuestDerivedSignals>(),
      methods: type<MacroQuestMethods>(),
    },
    withProps(() => ({
      mealPhotoAttachments: {
        enabled: true,
        accept: 'image/png,image/jpeg,image/webp',
        // Demo plates in public/meals include ~10MB JPEGs.
        maxSize: 12 * 1024 * 1024,
      } satisfies AttachmentsConfig as AttachmentsConfig,
    })),
    withHooks({
      onInit(store) {
        const agentContext = computed(() => ({
          description:
            'MacroQuest trusted Angular state from NgRx Signal Store. Use this context before proposing meal updates.',
          value: JSON.stringify({
            activeDate: store.activeDate(),
            goals: store.goals(),
            dailyTotals: store.dailyTotals(),
            remaining: store.remaining(),
            selectedMeal: store.selectedMeal(),
          }),
        }));

        connectMacroQuestSandboxStore(store);
        connectAgentContext(agentContext);

        const foodItemSchema = z.object({
          id: z.string().optional(),
          name: z.string(),
          servingLabel: z.string(),
          servings: z.number(),
          calories: z.number(),
          protein: z.number(),
          carbs: z.number(),
          fat: z.number(),
          confidence: z.number().min(0).max(1),
        });

        registerFrontendTool<MealDraftToolArgs>({
          name: 'logMealDraft',
          description:
            'Write a food analysis draft into the Angular NgRx Signal Store. Use this after estimating foods and macros.',
          parameters: z.object({
            title: z.string(),
            source: z.string().optional(),
            notes: z.string().optional(),
            items: z.array(foodItemSchema),
          }),
          handler: async (draft: MealDraftToolArgs) => {
            const meal = store.applyMealDraft({
              ...draft,
              items: draft.items.map(
                (item): FoodItem => ({
                  ...item,
                  id: item.id ?? '',
                }),
              ),
            });

            return {
              ok: true,
              mealId: meal.id,
              totals: getMealTotals(meal),
            };
          },
        });

        registerFrontendTool<MacroGoalsToolArgs>({
          name: 'setMacroGoals',
          description: 'Update MacroQuest daily macro goals in the Angular NgRx Signal Store.',
          parameters: z.object({
            calories: z.number().optional(),
            protein: z.number().optional(),
            carbs: z.number().optional(),
            fat: z.number().optional(),
          }),
          handler: async (goals: MacroGoalsToolArgs) => {
            store.setGoals(goals);
            return {
              ok: true,
              goals: store.goals(),
            };
          },
        });
      },
    }),
  );
}
