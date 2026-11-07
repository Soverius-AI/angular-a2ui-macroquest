import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import {
  BROWSER_LOCAL_RUNTIME,
  initializeBrowserLocalRuntime,
} from './app/macroquest/application/browser-local-runtime';
import { BrowserLocalApp } from './app/macroquest/ui/browser-local-app';

initializeBrowserLocalRuntime()
  .then((runtime) =>
    bootstrapApplication(BrowserLocalApp, {
      providers: [...appConfig.providers, { provide: BROWSER_LOCAL_RUNTIME, useValue: runtime }],
    }),
  )
  .catch((error) => {
    console.error(error);
    const root = document.querySelector('app-root');
    if (root) {
      root.setAttribute('role', 'alert');
      root.textContent = `Browser-local startup failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  });
