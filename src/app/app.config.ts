import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideCopilotChatLabels, provideCopilotKit } from '@copilotkit/angular';
import { mockMealsInterceptor } from './macroquest/application/mock-meals.interceptor';
import { catalog } from './macroquest/ui/catalog';

if (typeof globalThis.fetch === 'function') {
  globalThis.fetch = globalThis.fetch.bind(globalThis);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([mockMealsInterceptor])),
    provideCopilotKit({
      runtimeUrl: 'http://127.0.0.1:3210/api/copilotkit',
      a2ui: { catalog, includeSchema: true },
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
