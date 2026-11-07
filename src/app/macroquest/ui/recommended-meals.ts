import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { CopilotKit, injectAgentStore } from '@copilotkit/angular';
import { MacroQuestStore } from '../application/macro-quest-store';
import { MacroQuestSurface } from './marco-quest-surface';

/**
 * Main-area home of the agent's meal suggestions. While no surface is rendered the section
 * explains what lands here and offers one action: ask the agent for meals that fit the
 * macros still left today. The surface itself (and its one-click logging) is `mq-surface`.
 */
@Component({
  selector: 'mq-recommended-meals',
  template: `
    <section class="mq-card p-6 sm:p-8" aria-label="Recommended meals">
      <p class="text-xs font-bold uppercase tracking-[0.18em] text-base-content/50">
        For the rest of today
      </p>
      <h2 class="text-2xl font-black tracking-tight">Recommended meals</h2>

      <mq-surface />

      @if (!surface().hasSurface()) {
        <div
          class="mt-5 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-base-300 px-6 py-8 text-center"
          aria-live="polite"
        >
          @if (requested() || surface().building()) {
            <span class="loading loading-dots loading-md text-primary" aria-hidden="true"></span>
            <p class="text-sm text-base-content/70">Preparing suggestions…</p>
          } @else {
            <p class="max-w-md text-sm text-base-content/70">
              Meals the agent suggests show up here, each with one-click logging.
              {{ budgetLine() }}
            </p>
            <button
              type="button"
              class="btn btn-primary rounded-full"
              [disabled]="agentStore().isRunning()"
              (click)="suggest()"
            >
              Suggest meals for the rest of today
            </button>
          }
        </div>
      }
    </section>
  `,
  imports: [MacroQuestSurface],
})
export class RecommendedMeals {
  private readonly store = inject(MacroQuestStore);
  private readonly copilotKit = inject(CopilotKit);
  protected readonly agentStore = injectAgentStore('default');
  protected readonly surface = viewChild.required(MacroQuestSurface);
  /** True from the suggestion click until that run settles, before the surface starts building. */
  protected readonly requested = signal(false);

  protected readonly budgetLine = computed(() => {
    const left = this.store.remaining();
    return left.calories > 0
      ? `You have ${left.calories} kcal and ${left.protein} g protein left today.`
      : "You have reached today's calorie goal.";
  });

  /** Sends the request through the chat, so the suggestion is part of the conversation. */
  protected async suggest(): Promise<void> {
    const agent = this.agentStore().agent;
    if (!agent || agent.isRunning) return;
    const left = this.store.remaining();
    const fit =
      left.calories > 0
        ? `I have ${left.calories} kcal, ${left.protein} g protein, ${left.carbs} g carbs and ${left.fat} g fat left today. Suggest three meals that fit that budget`
        : 'I have reached my calorie goal for today. Suggest three light options under 200 kcal';
    agent.addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content: `${fit}, as MealCards in a Row so I can add one to the log with a click.`,
    });
    this.requested.set(true);
    try {
      await this.copilotKit.core.runAgent({ agent });
    } catch (error) {
      console.error('[MacroQuest] Suggestion run failed:', error);
    } finally {
      this.requested.set(false);
    }
  }
}
