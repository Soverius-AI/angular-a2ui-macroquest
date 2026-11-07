import { Component, computed, inject, input } from '@angular/core';
import { HumanInTheLoopToolCall } from '@copilotkit/angular';
import { MealDraft } from '../../../../contracts/meal-draft-schema';
import { MacroQuestStore } from '../application/macro-quest-store';

@Component({
  selector: 'mq-meal-draft-confirmation',
  template: `
    <p>{{ title() }}</p>
    @if (toolCall().status === 'executing') {
      <div class="mt-2 flex gap-2">
        <button type="button" class="btn btn-primary btn-sm" (click)="confirm()">Confirm</button>
        <button type="button" class="btn btn-ghost btn-sm" (click)="cancel()">Cancel</button>
      </div>
    }
  `,
})
export class MealDraftConfirmation {
  readonly toolCall = input.required<HumanInTheLoopToolCall<MealDraft>>();

  private readonly store = inject(MacroQuestStore);

  protected readonly title = computed(() => this.toolCall().args.title ?? '');

  protected confirm(): void {
    const call = this.toolCall();
    if (call.status !== 'executing') return;
    this.store.applyMealDraft(call.args);
    call.respond({ accepted: true });
  }

  protected cancel(): void {
    const call = this.toolCall();
    if (call.status === 'complete') return;
    call.respond({ accepted: false });
  }
}
