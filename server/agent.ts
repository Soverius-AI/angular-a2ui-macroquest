/**
 * The MacroQuest agent on the talk's starting branch. CopilotKit owns the
 * model call and tool selection. Meal analysis is a server-side tool.
 */
import { BuiltInAgent, defineTool } from '@copilotkit/runtime/v2';
import { modelApiKey } from './config';
import z from 'zod';
import { forwardMealAnalysis } from './meal-analysis-activity';
import { analyzeMealToolHandler, ToolExecutionOptions } from './prepared/analyze-meal-handler';

export const agent = new BuiltInAgent({
  model: `openai/google/gemma-4-26b-a4b-it`,
  apiKey: modelApiKey,
  prompt:
    'You are MacroQuest, which is food logger. You are only answering questions about that and also help for generic questions on food, healthy things.',
  maxSteps: 3,
  tools: [
    defineTool({
      name: 'analyze meal',
      description:
        'when the user uploads an image, analye the nutrition of that meal and return to the user',
      parameters: z.object({ description: z.string() }),
      execute: async ({ description }, options?: ToolExecutionOptions) =>
        analyzeMealToolHandler(description, options),
    }),
  ],
});

agent.use((_input, next) => forwardMealAnalysis(next.run(_input)));
