/** Node runtime adapter for the environment-neutral MacroQuest workflow. */
import { BuiltInAgent } from '@copilotkit/runtime/v2';
import { createMacroQuestAgent } from '../shared/macroquest-agent';
import { maxOutputTokens } from './config';
import { completeJson, streamChat, streamJson } from './model-client';

export { createMacroQuestAgent, macroQuestA2UIToolName } from '../shared/macroquest-agent';

const run = createMacroQuestAgent({ completeJson, streamChat, streamJson }, { maxOutputTokens });

export const agent = new BuiltInAgent({
  type: 'custom',
  factory: async ({ input, abortSignal }) => run(input, abortSignal),
});
