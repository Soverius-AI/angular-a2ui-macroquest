import { Component, computed, inject, input, Signal } from '@angular/core';
import { ActivityRenderer, AgentStore, injectAgentStore } from '@copilotkit/angular';
import { CopilotA2UISurface } from '@copilotkit/angular/a2ui';
import { catalog } from '../ai/catalog';
import { ActivityMessage } from '@ag-ui/core';

@Component({
  selector: 'mq-surface',
  template: `@if (operations().length) {
    <copilot-a2ui-surface [catalog]="catalog" [operations]="operations()" />
  }`,
  imports: [CopilotA2UISurface],
})
export class MacroQuestSurface {
  private readonly agentStore = injectAgentStore('default');
  private readonly catalog = catalog;

  private readonly operations = computed(() =>
    this.agentStore()
      .messages()
      .flatMap((message) => {
        if (message.role !== 'activity' || message.activityType !== 'a2ui-surface') {
          return [];
        }

        const operations = message.content['a2ui_operations'];
        return Array.isArray(operations) ? operations : [operations];
      }),
  );
}
