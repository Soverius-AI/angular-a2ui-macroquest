import { Component, computed, input } from '@angular/core';
import { ActivityMessage } from '@ag-ui/core';
import z from 'zod';
import { mealAnalysisActivityType } from '../../../../contracts/meal-analysis-activity';

export { mealAnalysisActivityType };

export const mealAnalysisActivityContent = z.object({
  title: z.string(),
  phase: z.enum(['sending', 'ready', 'error']).optional(),
});

@Component({
  selector: 'mq-meal-analysis-activity',
  template: `
    <p
      role="status"
      class="my-1 flex w-fit max-w-full items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-sm font-medium text-base-content"
    >
      @switch (phase()) {
        @case ('sending') {
          <span
            class="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary"
            aria-hidden="true"
          ></span>
        }
        @case ('ready') {
          <span class="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true"></span>
        }
        @default {
          <span class="h-2 w-2 shrink-0 rounded-full bg-error" aria-hidden="true"></span>
        }
      }
      <span>{{ title() }}</span>
    </p>
  `,
})
export class MealAnalysisActivity {
  readonly activityType = input.required<string>();
  readonly content = input.required<z.infer<typeof mealAnalysisActivityContent>>();
  readonly message = input.required<ActivityMessage>();
  readonly agent = input(undefined);

  protected readonly title = computed(() => this.content().title);
  protected readonly phase = computed(() => this.content().phase ?? 'sending');
}
