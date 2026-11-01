import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  anyActivityContentSchema,
  provideCopilotChatLabels,
  provideCopilotKit,
  registerRenderActivityMessage,
} from '@copilotkit/angular';
import { mockMealsInterceptor } from './macroquest/application/mock-meals.interceptor';
import { catalog } from './macroquest/ai/catalog';
import { NoopActivity } from './macroquest/ai/noop-activity';

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
    provideAppInitializer(() => {
      registerRenderActivityMessage({
        activityType: 'a2ui-surface',
        component: NoopActivity,
        content: anyActivityContentSchema,
      });
    }),
  ],
};
