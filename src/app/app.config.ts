import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideCopilotKit } from '@copilotkit/angular';
import { basicCatalog } from '@copilotkit/angular/a2ui';
import { mockMealsInterceptor } from './macroquest/application/mock-meals.interceptor';

if (typeof globalThis.fetch === 'function') {
  globalThis.fetch = globalThis.fetch.bind(globalThis);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([mockMealsInterceptor])),
    provideCopilotKit({
      runtimeUrl: 'http://localhost:3210/api/copilotkit',
      a2ui: {
        catalog: basicCatalog,
        includeSchema: true,
      },
    }),
  ],
};
