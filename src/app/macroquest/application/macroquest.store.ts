import { signalStore } from '@ngrx/signals';
import { withCopilot } from './features/with-copilot';
import { withMacroQuest } from './features/with-macroquest';

export const MacroQuestStore = signalStore(
  { providedIn: 'root' },
  withMacroQuest(),
  withCopilot(),
);
