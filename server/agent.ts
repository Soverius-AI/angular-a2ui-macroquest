/**
 * The MacroQuest agent on the talk's starting branch. CopilotKit owns the
 * model call and tool selection. Meal analysis is a server-side tool.
 */
import { BuiltInAgent, defineTool } from '@copilotkit/runtime/v2';
import { modelApiKey } from './config';
import z from 'zod';
import { analyzeMealToolHandler, ToolExecutionOptions } from './prepared/analyze-meal-handler';
import { forwardMealAnalysis } from './meal-analysis-activity';
import {
  analyzeMealToolName,
  macroQuestMaxSteps,
  macroQuestPrompt,
} from '../contracts/macroquest-agent';

export const agent = new BuiltInAgent({
  model: `openai/google/gemini-3.8-flash`,
  apiKey: modelApiKey,
  prompt: macroQuestPrompt,
  maxSteps: macroQuestMaxSteps,
  tools: [
    defineTool({
      name: analyzeMealToolName,
      description:
        'Analyze the meal provided as an image and return the nutrition in the form of calroies, carbs, fat, etc.',
      parameters: z.object({ description: z.string() }),
      execute: ({ description }, options?: ToolExecutionOptions) =>
        analyzeMealToolHandler(description, options),
    }),
  ],
});

agent.use((_input, next) => forwardMealAnalysis(next.run(_input)));
