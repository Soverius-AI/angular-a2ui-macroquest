import { Component, computed, signal } from '@angular/core';
import { CopilotA2UISurface } from '@copilotkit/angular/a2ui';
import { macroQuestCatalog } from '../a2ui/catalog';

@Component({
  selector: 'mq-a2ui-step-player',
  imports: [CopilotA2UISurface],
  template: `
    <div class="flex flex-col items-start gap-3">
      @let play = currentPlay();
      <h3>Status: {{ play.name }}</h3>
      <copilot-a2ui-surface [catalog]="catalog" [operations]="operations()" />
      @if (hasNext()) {
        <button type="button" class="btn btn-primary btn-sm" (click)="next()">
          {{ play.name }}
        </button>
      }
    </div>
  `,
})
export class A2uiStepPlayer {
  private readonly steps = [
    {
      name: 'creating the surface',
      message: {
        version: 'v0.9',
        createSurface: { surfaceId: 'label', catalogId: 'macroquest' },
      },
    },
    {
      name: 'adding a label',
      message: {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 'label',
          components: [{ id: 'root', component: 'Label', text: 'Protein left today' }],
        },
      },
    },
    {
      name: 'adding buttons',
      message: {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 'label',
          components: [
            {
              id: 'root',
              component: 'Label',
              text: 'Protein left today',
              children: ['btn-1', 'btn-2'],
            },
            { id: 'btn-1', component: 'Button', label: 'Schnitzel' },
            { id: 'btn-2', component: 'Button', label: 'Gulasch' },
          ],
        },
      },
    },
  ];

  private readonly currentPlayIx = signal(0);

  protected readonly catalog = macroQuestCatalog;
  protected readonly currentPlay = computed(() => this.steps[this.currentPlayIx()]);

  protected readonly operations = computed(() =>
    this.steps.slice(0, this.currentPlayIx() + 1).map((step) => step.message),
  );
  protected readonly hasNext = computed(() => this.currentPlayIx() < this.steps.length - 1);

  protected next(): void {
    if (!this.hasNext()) return;
    this.currentPlayIx.update((index) => index + 1);
  }
}
