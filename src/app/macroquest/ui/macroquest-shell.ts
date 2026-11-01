import { Component, computed, inject, viewChild } from '@angular/core';
import { ActivityMessage } from '@ag-ui/core';
import {
  CopilotA2UIActivityRenderer,
  CopilotChat,
  anyActivityContentSchema,
  injectAgentStore,
  registerRenderActivityMessage,
} from '@copilotkit/angular';
import { MacroQuestStore } from '../application/macro-quest-store';
import { A2uiLocation } from './a2ui-location';
import { DemoMealPlates } from './demo-meal-plates';
import { MacroDashboard } from './macro-dashboard';
import { MealTimeline } from './meal-timeline';
import { RecommendedMeals } from './recommended-meals';

@Component({
  selector: 'mq-shell',
  imports: [
    MacroDashboard,
    RecommendedMeals,
    MealTimeline,
    DemoMealPlates,
    CopilotChat,
    CopilotA2UIActivityRenderer,
  ],
  templateUrl: './macroquest-shell.html',
})
export class MacroQuestShell {
  protected readonly chat = viewChild(CopilotChat);
  protected readonly store = inject(MacroQuestStore);
  protected readonly agentStore = injectAgentStore('default');
  protected readonly surfaces = computed(() =>
    this.agentStore()
      .messages()
      .filter(
        (message): message is ActivityMessage =>
          message.role === 'activity' && message.activityType === 'a2ui-surface',
      ),
  );

  constructor() {
    registerRenderActivityMessage({
      activityType: 'a2ui-surface',
      content: anyActivityContentSchema,
      component: A2uiLocation,
    });
  }
}
