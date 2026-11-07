export interface ModelPreset {
  id: string;
  label: string;
}

/** Hosted providers the worker can call directly from the browser with the user's own key. */
export const providers = {
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    host: 'openrouter.ai',
    defaultModel: 'google/gemini-3.8-flash',
    /** All support tool calling, image input and JSON output on OpenRouter (checked 2026-11-07). */
    models: [
      { id: 'google/gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
      { id: 'google/gemma-4-26b-a4b-it', label: 'Gemma 4 26B (A4B)' },
      { id: 'google/gemma-4-31b-it', label: 'Gemma 4 31B' },
      { id: 'anthropic/claude-haiku-5.5', label: 'Claude Haiku 5.5' },
      { id: 'anthropic/claude-sonnet-5.5', label: 'Claude Sonnet 5.5' },
      { id: 'openai/gpt-6.1-terra', label: 'GPT-6.1 Terra' },
      { id: 'openai/gpt-5.2', label: 'GPT-5.2' },
      { id: 'moonshotai/kimi-k2.5', label: 'Kimi K2.5' },
    ] as ModelPreset[],
    keyPlaceholder: 'sk-or-v1-…',
    keysUrl: 'https://openrouter.ai/keys',
    /** App attribution; Google's CORS preflight rejects this header, so it is per provider. */
    headers: { 'X-Title': 'MacroQuest' },
    /** Gemini 3 reasons by default; keep it short so answers and tool calls arrive quickly. */
    body: { reasoning: { effort: 'low' } },
  },
  gemini: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    host: 'generativelanguage.googleapis.com',
    defaultModel: 'gemini-3.8-flash',
    models: [{ id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' }] as ModelPreset[],
    keyPlaceholder: 'AIza…',
    keysUrl: 'https://aistudio.google.com/apikey',
    headers: {},
    body: { reasoning_effort: 'low' },
  },
} as const;
export type ProviderId = keyof typeof providers;
export const providerIds = Object.keys(providers) as ProviderId[];
export const defaultProvider: ProviderId = 'gemini';
