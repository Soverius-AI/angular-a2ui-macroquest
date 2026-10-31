/**
 * The MacroQuest agent on the talk's starting branch. CopilotKit owns the
 * model call and tool selection. Meal analysis is a server-side tool.
 */
import { BuiltInAgent, defineTool } from '@copilotkit/runtime/v2';
import { modelApiKey } from './config';
import z from 'zod';
import { analyzeMealToolHandler, ToolExecutionOptions } from './prepared/analyze-meal-handler';
import { forwardMealAnalysis } from './meal-analysis-activity';

export const agent = new BuiltInAgent({
  model: `openai/google/gemma-4-26b-a4b-it`,
  apiKey: modelApiKey,
  prompt:
    'You are MacroQuest, you are a food logger. Only answer questions about food and similar things.',
  maxSteps: 2,
  tools: [
    defineTool({
      name: 'analyze_meal',
      description:
        'Analyze the meal provided as an image and return the nutrition in the form of calroies, carbs, fat, etc.',
      parameters: z.object({ description: z.string() }),
      execute: ({ description }, options?: ToolExecutionOptions) =>
        analyzeMealToolHandler(description, options),
    }),
  ],
});

agent.use((_input, next) => forwardMealAnalysis(next.run(_input)));
