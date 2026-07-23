/**
 * Daily macro goal extraction for the setMacroGoals frontend tool.
 */
import type { Message } from "@ag-ui/core";
import { lastUserMessage, userText } from "./agui";
import { completeJson } from "./model-client";
import { buildGoalsExtractionPrompt } from "./prompts";
import {
  macroGoalsResponseFormat,
  macroGoalsSchema,
  type MacroGoals,
} from "./schemas";

export async function extractMacroGoals(
  messages: Message[],
  abortSignal: AbortSignal,
): Promise<MacroGoals> {
  const goals = await completeJson({
    prompt: buildGoalsExtractionPrompt(userText(lastUserMessage(messages)?.content ?? "")),
    responseFormat: macroGoalsResponseFormat,
    parser: macroGoalsSchema,
    maxTokens: 64,
    temperature: 0,
    abortSignal,
  });

  return Object.fromEntries(
    Object.entries(goals)
      .filter(([, value]) => value !== undefined && value > 0)
      .map(([key, value]) => [key, Math.round(value!)]),
  );
}
