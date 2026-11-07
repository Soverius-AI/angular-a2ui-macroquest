/** Compiled ONLY by --test-fixture; never imported by production application code. */
import type { ModelClient } from '../../shared/macroquest-agent/model-client';

const meal = {
  mealDraft: {
    title: 'Fixture chicken bowl',
    source: 'Protocol test fixture',
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
  },
  a2ui: {
    surfaceId: 'fixture-meal',
    components: [
      { id: 'root', component: 'Card', child: 'layout' },
      { id: 'layout', component: 'Column', children: ['title', 'totals', 'apply'] },
      { id: 'title', component: 'Text', text: 'Fixture chicken bowl', variant: 'h2' },
      { id: 'totals', component: 'Text', text: 'Calories 400 · Protein 40g · Carbs 30g · Fat 10g' },
      {
        id: 'apply',
        component: 'Button',
        child: 'label',
        action: { event: { name: 'applyMealDraft' } },
      },
      { id: 'label', component: 'Text', text: 'Apply found macros' },
    ],
    data: {},
  },
};

export async function loadBrowserModel(options: {
  onProgress?: (text: string) => void;
}): Promise<{ client: ModelClient; device: 'webgpu' | 'wasm'; dispose: () => Promise<void> }> {
  options.onProgress?.('Test fixture loaded — no model download or GPU inference.');
  const client: ModelClient = {
    async completeJson(input) {
      input.abortSignal.throwIfAborted();
      const latest = input.prompt.split('Latest user message:').at(-1) ?? '';
      const value = input.prompt.includes('Classify the user')
        ? {
            intent: /chart|graph/i.test(latest)
              ? 'macro_chart'
              : /lighter|swap/i.test(latest)
                ? 'macro_swap_lab'
                : /set.*goals/i.test(latest)
                  ? 'set_goals'
                  : /analyze|chicken bowl/i.test(latest)
                    ? 'analyze_meal'
                    : 'chat',
          }
        : input.prompt.includes('Extract')
          ? { calories: 2100, protein: 160 }
          : meal;
      return input.parser.parse(value);
    },
    async *streamChat(input) {
      const slow = input.messages.at(-1)?.content.includes('slow');
      for (const text of ['Fixture reply: ', 'your prompts stayed local.']) {
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
        yield text;
      }
    },
    async *streamJson(input) {
      input.abortSignal.throwIfAborted();
      yield JSON.stringify({
        initialHeight: 220,
        placeholderMessages: ['Fixture widget'],
        css: 'body{font-family:system-ui}',
        html: "<main><h2>Fixture macro chart</h2><button id='toggle'>Show values</button><p id='result'></p></main>",
        jsFunctions:
          "globalThis.showValues=function(){document.getElementById('result').textContent='Fixture values shown';}",
        jsExpressions: ["document.getElementById('toggle').onclick=globalThis.showValues"],
      });
    },
  };
  return { client, device: 'webgpu', dispose: async () => {} };
}
