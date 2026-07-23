/**
 * Intent routing: one cheap grammar-constrained classification per user turn.
 * Routing is entirely model-driven — the response_format enum makes any
 * answer outside the five intents unrepresentable. If the classification call
 * itself fails (model down, aborted), we degrade to "chat", whose handler
 * already explains an unreachable model to the user.
 */
import type { Message } from "@ag-ui/core";
import { historyDigest, lastUserMessage, userText } from "./agui";
import { completeJson } from "./model-client";
import { buildIntentClassificationPrompt } from "./prompts";
import { intentResponseFormat, intentResultSchema, type Intent } from "./schemas";

export async function classifyIntent(
  messages: Message[],
  abortSignal: AbortSignal,
): Promise<Intent> {
  const prompt = userText(lastUserMessage(messages)?.content ?? "");

  try {
    const result = await completeJson({
      prompt: buildIntentClassificationPrompt(historyDigest(messages, 6), prompt),
      responseFormat: intentResponseFormat,
      parser: intentResultSchema,
      maxTokens: 48,
      temperature: 0,
      abortSignal,
    });
    return result.intent;
  } catch {
    return "chat";
  }
}
