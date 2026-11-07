/** Compiled ONLY by --test-fixture; never imported by production application code. */
import type { ChatChunk, ChatMessage, ModelClient } from '../../byok/model-client';

const draft = {
  title: 'Fixture chicken bowl',
  notes: 'Not model inference.',
  items: [
    {
      name: 'Chicken bowl',
      servingLabel: '1 bowl',
      servings: 1,
      calories: 400,
      protein: 40,
      carbs: 30,
      fat: 10,
      confidence: 0.8,
    },
  ],
};

function toolName(messages: ChatMessage[], toolCallId: string): string | undefined {
  for (const message of messages)
    if (message.role === 'assistant')
      for (const call of message.tool_calls ?? [])
        if (call.id === toolCallId) return call.function.name;
  return undefined;
}

/** Scripted turns: the fixture decides from the latest user prompt or the latest tool result. */
function scriptedTurn(messages: ChatMessage[]): ChatChunk[] {
  const last = messages.at(-1)!;
  if (last.role === 'tool') {
    const name = toolName(messages, last.tool_call_id);
    if (name === 'analyze_meal') {
      const { title, notes, items } = JSON.parse(last.content);
      return [{ type: 'tool_call', name: 'add_meal_to_log', arguments: { title, notes, items } }];
    }
    return [{ type: 'text', delta: `Fixture: ${name} finished.` }];
  }
  const prompt = [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
  if (/chicken bowl/i.test(prompt))
    return [{ type: 'tool_call', name: 'analyze_meal', arguments: { description: prompt } }];
  if (/previous day/i.test(prompt))
    return [{ type: 'tool_call', name: 'show_previous_day', arguments: {} }];
  if (/chart/i.test(prompt))
    return [
      {
        type: 'tool_call',
        name: 'generateSandboxedUi',
        arguments: {
          initialHeight: 220,
          placeholderMessages: ['Fixture widget'],
          css: 'body{font-family:system-ui}',
          html: "<main><h2>Fixture macro chart</h2><button id='toggle'>Show values</button><p id='result'></p></main>",
          jsFunctions:
            "globalThis.showValues=function(){document.getElementById('result').textContent='Fixture values shown';}",
          jsExpressions: ["document.getElementById('toggle').onclick=globalThis.showValues"],
        },
      },
    ];
  if (/card/i.test(prompt))
    return [
      {
        type: 'tool_call',
        name: 'render_a2ui',
        arguments: {
          surfaceId: 'fixture-surface',
          components: [{ id: 'root', component: 'Text', text: 'Fixture surface text' }],
        },
      },
    ];
  return [
    { type: 'text', delta: 'Fixture reply: ' },
    { type: 'text', delta: 'your prompts stayed in this tab.' },
  ];
}

export function createOpenAICompatibleModelClient(options: { apiKey: string }): ModelClient {
  if (!options.apiKey) throw new Error('fixture needs a key');
  return {
    async *streamChat(input) {
      input.abortSignal.throwIfAborted();
      const slow = input.messages.some(
        (message) => message.role === 'user' && message.content.includes('slow'),
      );
      for (const chunk of scriptedTurn(input.messages)) {
        if (slow)
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, 3000);
            input.abortSignal.addEventListener(
              'abort',
              () => {
                clearTimeout(timer);
                reject(new DOMException('Cancelled', 'AbortError'));
              },
              { once: true },
            );
          });
        input.abortSignal.throwIfAborted();
        yield chunk;
      }
    },
    async completeJson(input) {
      input.abortSignal.throwIfAborted();
      return input.parser.parse(draft);
    },
  };
}
