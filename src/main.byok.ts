import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { BYOK_RUNTIME, initializeByokRuntime } from './app/macroquest/application/byok-runtime';
import { ByokApp } from './app/macroquest/ui/byok-app';

initializeByokRuntime()
  .then((runtime) =>
    bootstrapApplication(ByokApp, {
      providers: [...appConfig.providers, { provide: BYOK_RUNTIME, useValue: runtime }],
    }),
  )
  .catch((error) => {
    console.error(error);
    const root = document.querySelector('app-root');
    if (root) {
      root.setAttribute('role', 'alert');
      root.textContent = `Startup failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  });
