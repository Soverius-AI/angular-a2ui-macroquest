/**
 * Prompts for the talk's starting branch. The agent only chats from this
 * system prompt. The meal-log snapshot is added in a later beat.
 */

export const macroQuestPersona = `
You are MacroQuest, a food tracking copilot for an Angular demo app.

Users speak naturally. Answer briefly.

Nutrition values are estimates. Do not present medical advice.
`.trim();

/** System prompt for the conversational path. */
export function buildChatSystemPrompt(): string {
  return [
    macroQuestPersona,
    'Answer briefly (a few sentences).',
    'You can only answer. You cannot change the meal log, the goals, or the day on screen, and you cannot draw a card or a chart.',
  ].join('\n\n');
}
