import { Component, inject } from '@angular/core';
import { A2UIClientEventMessage } from '@copilotkit/angular';
import { mealDraftSchema } from '../../../../contracts/meal-draft-schema';
import { MacroQuestStore } from '../application/macro-quest-store';
import { catalog } from '../ai/catalog';
import { MacroQuestSurface } from './marco-quest-surface';

@Component({
  selector: 'mq-recommended-meals',
  template: `
    <section class="mq-card p-6 sm:p-8" aria-label="Recommended meals">
      <div>
        <p class="text-xs font-bold uppercase tracking-[0.18em] text-base-content/50">
          For the rest of today
        </p>
        <h2 class="text-2xl font-black tracking-tight">Recommended meals</h2>

        <!-- <copilot-a2ui-surface
          [catalog]="catalog"
          [operations]="operations"
          (action)="handleAction($event)"
        /> -->

        <mq-surface />
      </div>

      <div class="mt-6 flex items-center justify-center rounded-2xl px-6 text-center"></div>
    </section>
  `,
  imports: [MacroQuestSurface],
  // imports: [CopilotA2UISurface],
})
export class RecommendedMeals {
  private readonly store = inject(MacroQuestStore);
  private readonly catalog = catalog;

  // private readonly operations = [
  //   {
  //     version: 'v0.9',
  //     createSurface: {
  //       surfaceId: 'main',
  //     },
  //   },
  //   {
  //     updateComponents: {
  //       surfaceId: 'main',
  //       components: [
  //         {
  //           id: 'root',
  //           component: 'Text',
  //           text: 'Data is loading...',
  //         },
  //       ],
  //     },
  //   },
  //   {
  //     updateComponents: {
  //       surfaceId: 'main',
  //       components: [
  //         {
  //           id: 'root',
  //           component: 'Row',
  //           children: { componentId: 'btn', path: '/meals' },
  //         },
  //         {
  //           id: 'btn',
  //           component: 'Button',
  //           child: 'button-label',
  //           action: {
  //             event: {
  //               name: 'add_meal',
  //               surfaceId: 'main',
  //               context: {
  //                 path: '',
  //               },
  //             },
  //           },
  //         },
  //         {
  //           id: 'button-label',
  //           component: 'Text',
  //           text: { path: 'title' },
  //         },
  //       ],
  //     },
  //   },
  //   {
  //     updateDataModel: {
  //       surfaceId: 'main',
  //       path: '/meals',
  //       value: recommendedMeals,
  //     },
  //   },
  // ];

  handleAction(event: A2UIClientEventMessage) {
    this.store.applyMealDraft(mealDraftSchema.parse(event.userAction.context));
  }
}
