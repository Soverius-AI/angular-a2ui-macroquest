import { Component, inject } from '@angular/core';
import { MacroQuestStore } from '../application/macro-quest-store';

@Component({
  selector: 'mq-recommended-meals',
  template: `
    <section class="mq-card p-6 sm:p-8" aria-label="Recommended meals">
      <div>
        <p class="text-xs font-bold uppercase tracking-[0.18em] text-base-content/50">
          For the rest of today
        </p>
        <h2 class="text-2xl font-black tracking-tight">Recommended meals</h2>
      </div>

      <div class="mt-6 flex items-center justify-center rounded-2xl px-6 text-center"></div>
    </section>
  `,
})
export class RecommendedMeals {
  private readonly store = inject(MacroQuestStore);
}
