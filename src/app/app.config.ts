import { copilotRuntimeUrl } from './runtime-url';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideCopilotChatLabels, provideCopilotKit } from '@copilotkit/angular';
import { mockMealsInterceptor } from './macroquest/application/mock-meals.interceptor';
import { catalog } from './macroquest/ai/catalog';
import { macroQuestDesignSkill } from './macroquest/ai/design-skill';

if (typeof globalThis.fetch === 'function') {
  globalThis.fetch = globalThis.fetch.bind(globalThis);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([mockMealsInterceptor])),
    provideCopilotKit({
      runtimeUrl: copilotRuntimeUrl,
      a2ui: { catalog, includeSchema: true },
      openGenerativeUI: { designSkill: macroQuestDesignSkill },
      enableInspector: false,
      suggestionsConfig: [
        {
          suggestions: [
            {
              title: 'Recommend meals',
              message: `Ask me from which cuisine I should recommend meals.
                After that show me a few recommendatiosn and add an option to add them to the meal log.
                Each meal should also show an image.`,
            },
          ],
          available: 'always',
        },
      ],
    }),
  ],
};
