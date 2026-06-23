import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideCopilotChatLabels, provideCopilotKit } from '@copilotkit/angular';
import {
  applyMacroSwapFromSandbox,
  macroSwapSandboxSchema,
} from './macroquest/application/macroquest-sandbox';

if (typeof globalThis.fetch === 'function') {
  globalThis.fetch = globalThis.fetch.bind(globalThis);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideCopilotKit({
      runtimeUrl: 'http://127.0.0.1:3210/api/copilotkit',
      licenseKey: 'ck_pub_00000000000000000000000000000000',
      a2ui: {
        includeSchema: true,
      },
      // Static starter prompts only. These render purely client-side (no model
      // call). A dynamic `after-first-message` config was removed: it fires a
      // second suggestion-generation request that competes with the main chat
      // request on the single-slot local llama.cpp server, starving the main
      // response (RUN_STARTED -> RUN_FINISHED with no content).
      suggestionsConfig: [
        {
          available: 'before-first-message',
          suggestions: [
            {
              title: 'Analyze a meal',
              message: 'Analyze a grilled chicken bowl with rice and beans.',
            },
            {
              title: 'Set macro goals',
              message: 'Set my daily goals to 2000 calories and 150g protein.',
            },
            {
              title: 'Lighter swap',
              message: 'Suggest a lighter version of my current meal.',
            },
            {
              title: 'Chart my macros',
              message: 'Show me a chart of my macros versus my goals.',
            },
          ],
        },
      ],
      openGenerativeUI: {
        sandboxFunctions: [
          {
            name: 'applyMacroSwap',
            description:
              'Apply a generated lighter macro swap to the selected MacroQuest meal in the Angular NgRx Signal Store.',
            parameters: macroSwapSandboxSchema,
            handler: applyMacroSwapFromSandbox,
          },
        ],
      },
    }),
    provideCopilotChatLabels({
      chatInputPlaceholder: 'Ask Gemma about a meal...',
      chatDisclaimerText:
        'MacroQuest estimates nutrition for demo purposes and is not medical advice.',
    }),
  ],
};
