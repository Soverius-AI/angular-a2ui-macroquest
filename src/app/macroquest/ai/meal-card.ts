import { Component, input } from '@angular/core';

/**
 * Custom A2UI component: a MacroQuest meal suggestion. Registered in catalog.ts, so the
 * model can emit it (its schema is part of the catalog the client sends) and both the
 * chat surface and the main-area surface render it with the app's own look.
 */
@Component({
  selector: 'mq-meal-card',
  template: `
    <article class="card card-compact h-full border border-base-300 bg-base-100 shadow-sm">
      @if (image()) {
        <figure class="aspect-[4/3] overflow-hidden bg-base-200">
          <img class="h-full w-full object-cover" [src]="image()" [alt]="title()" loading="lazy" />
        </figure>
      }
      <div class="card-body gap-2">
        <div class="flex items-start justify-between gap-3">
          <h3 class="card-title text-base leading-tight">{{ title() }}</h3>
          <span class="badge badge-primary badge-outline whitespace-nowrap font-bold">
            {{ calories() }} kcal
          </span>
        </div>
        @if (note()) {
          <p class="text-sm text-base-content/70">{{ note() }}</p>
        }
        <dl class="grid grid-cols-3 gap-2 text-center text-xs">
          <div class="rounded-box bg-indigo-50 px-2 py-1.5">
            <dt class="text-indigo-700/70">Protein</dt>
            <dd class="font-bold text-indigo-700">{{ protein() }} g</dd>
          </div>
          <div class="rounded-box bg-amber-50 px-2 py-1.5">
            <dt class="text-amber-700/70">Carbs</dt>
            <dd class="font-bold text-amber-700">{{ carbs() }} g</dd>
          </div>
          <div class="rounded-box bg-pink-50 px-2 py-1.5">
            <dt class="text-pink-700/70">Fat</dt>
            <dd class="font-bold text-pink-700">{{ fat() }} g</dd>
          </div>
        </dl>
        @if (action(); as act) {
          <div class="card-actions mt-1">
            <button
              class="btn btn-primary btn-sm w-full rounded-full"
              type="button"
              (click)="act()"
            >
              Add to log
            </button>
          </div>
        }
      </div>
    </article>
  `,
})
export class MealCard {
  readonly title = input.required<string>();
  readonly calories = input.required<number>();
  readonly protein = input.required<number>();
  readonly carbs = input.required<number>();
  readonly fat = input.required<number>();
  readonly image = input<string>();
  readonly note = input<string>();
  readonly action = input<() => void>();
}
