/**
 * The MacroQuest workflow routes every run —
 * A2UI apply actions, tool-result continuations, then the five intents
 * (analyze_meal, macro_swap_lab, macro_chart, set_goals, chat).
 */
import type { BaseEvent, Context, Message, RunAgentInput } from '@ag-ui/core';
import {
  contextBlock,
  getApplyMealDraftAction,
  latestMessageHasImage,
  textChunk,
  toChatHistory,
  toolCallEvents,
  trailingToolResult,
} from './agui';
import { extractMacroGoals } from './goals';
import { classifyIntent } from './intent';
import { generateMealUI, type MealDraft } from './meal-surface';
import type { ModelClient } from './model-client';
import {
  assistantCopy as defaultAssistantCopy,
  buildChatSystemPrompt,
  buildMacroChartPrompt,
  buildMacroSwapLabPrompt,
} from './prompts';
import { streamOpenGenerativeUIToolEvents } from './open-generative-ui';
import type { MacroGoals } from './schemas';

export const macroQuestA2UIToolName = 'macroquest_render_a2ui';

/** Creates an environment-neutral workflow with isolated, per-thread draft state. */
export function createMacroQuestAgent(
  client: ModelClient,
  options: { maxOutputTokens?: number; copy?: Partial<typeof defaultAssistantCopy> } = {},
): (input: RunAgentInput, abortSignal: AbortSignal) => AsyncGenerator<BaseEvent> {
  const maxOutputTokens = options.maxOutputTokens ?? 32768;
  const assistantCopy = { ...defaultAssistantCopy, ...options.copy };
  const threads = new Map<
    string,
    {
      pendingMealDraftsBySurface: Map<string, MealDraft>;
      appliedMealDraftActionKeys: Set<string>;
    }
  >();

  return async function* (input, abortSignal) {
    let state = threads.get(input.threadId);
    if (!state) {
      state = {
        pendingMealDraftsBySurface: new Map(),
        appliedMealDraftActionKeys: new Set(),
      };
      threads.set(input.threadId, state);
    }
    const { pendingMealDraftsBySurface, appliedMealDraftActionKeys } = state;
    const messages = input.messages as Message[];
    const context = (input.context ?? []) as Context[];

    const applyAction = getApplyMealDraftAction(input.forwardedProps);
    if (applyAction) {
      if (appliedMealDraftActionKeys.has(applyAction.actionKey)) {
        return;
      }

      const messageId = crypto.randomUUID();
      const draft = pendingMealDraftsBySurface.get(applyAction.surfaceId);

      if (!draft) {
        yield textChunk(messageId, assistantCopy.missingPendingDraft);
        return;
      }

      yield textChunk(messageId, assistantCopy.applyingMacros);
      yield* toolCallEvents(messageId, 'logMealDraft', draft);

      pendingMealDraftsBySurface.delete(applyAction.surfaceId);
      appliedMealDraftActionKeys.add(applyAction.actionKey);
      return;
    }

    // Tool-result continuation runs must not start a new generation.
    const toolResult = trailingToolResult(messages);
    if (toolResult) {
      if (toolResult.toolName === 'logMealDraft') {
        const messageId = crypto.randomUUID();
        yield textChunk(messageId, assistantCopy.mealLogged);
      }
      // Other tool results (such as setMacroGoals) need no
      // follow-up message; their UI already reflects the change.
      return;
    }

    const intent = latestMessageHasImage(messages)
      ? 'analyze_meal'
      : await classifyIntent(client, messages, abortSignal);

    if (intent === 'macro_swap_lab') {
      const messageId = crypto.randomUUID();
      yield textChunk(messageId, assistantCopy.generatingSwapLab);

      try {
        yield* streamOpenGenerativeUIToolEvents(client, messageId, messages, context, abortSignal, {
          buildPrompt: buildMacroSwapLabPrompt,
          maxTokens: Math.min(maxOutputTokens, 6144),
        });
      } catch (error) {
        console.warn('Macro Swap Lab generation failed:', error);
        yield textChunk(messageId, assistantCopy.swapLabFailed);
        return;
      }

      yield textChunk(messageId, assistantCopy.swapLabReady);
      return;
    }

    if (intent === 'macro_chart') {
      const messageId = crypto.randomUUID();
      yield textChunk(messageId, assistantCopy.drawingChart);

      try {
        yield* streamOpenGenerativeUIToolEvents(client, messageId, messages, context, abortSignal, {
          buildPrompt: buildMacroChartPrompt,
          maxTokens: Math.min(maxOutputTokens, 6144),
        });
      } catch (error) {
        console.warn('Macro chart generation failed:', error);
        yield textChunk(messageId, assistantCopy.chartFailed);
        return;
      }

      return;
    }

    if (intent === 'set_goals') {
      const messageId = crypto.randomUUID();

      let goals: MacroGoals = {};
      try {
        goals = await extractMacroGoals(client, messages, abortSignal);
      } catch {
        // fall through to the empty-goals reply below
      }

      const entries = Object.entries(goals);
      if (entries.length === 0) {
        yield textChunk(messageId, assistantCopy.askForGoals);
        return;
      }

      const summary = entries
        .map(([key, value]) => `${key} ${value}${key === 'calories' ? ' kcal' : 'g'}`)
        .join(', ');
      yield textChunk(messageId, assistantCopy.settingGoals(summary));
      yield* toolCallEvents(messageId, 'setMacroGoals', goals);
      return;
    }

    if (intent === 'chat') {
      const messageId = crypto.randomUUID();
      try {
        const stream = client.streamChat({
          messages: [
            { role: 'system', content: buildChatSystemPrompt(contextBlock(context)) },
            ...toChatHistory(messages, 12),
          ],
          maxTokens: Math.min(maxOutputTokens, 768),
          temperature: 0.4,
          abortSignal,
        });
        for await (const delta of stream) {
          yield textChunk(messageId, delta);
        }
      } catch (error) {
        yield textChunk(messageId, assistantCopy.modelUnreachable);
      }
      return;
    }

    // intent === "analyze_meal"
    const hasImage = latestMessageHasImage(messages);
    const messageId = crypto.randomUUID();
    yield textChunk(
      messageId,
      hasImage ? assistantCopy.scanningImage : assistantCopy.estimatingFromText,
    );

    let generated;
    try {
      generated = await generateMealUI(client, messages, context, abortSignal, maxOutputTokens);
    } catch (error) {
      console.warn('Meal analysis generation failed:', error);
      yield textChunk(messageId, assistantCopy.mealEstimateFailed);
      return;
    }
    const { draft, a2ui } = generated;
    pendingMealDraftsBySurface.set(a2ui.surfaceId, draft);

    yield textChunk(
      messageId,
      assistantCopy.mealSurfaceReady(draft.items.map((item) => item.name).join(', ')),
    );
    yield* toolCallEvents(messageId, macroQuestA2UIToolName, a2ui);
  };
}
