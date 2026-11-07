# Bring your own key: the MacroQuest agent in the browser, no backend

`pnpm start:byok` serves a static build in which the whole CopilotKit agent runs
inside the browser tab and calls the model provider directly with a key the
user pastes. There is no server of ours: no Node runtime, no proxy, no storage
of the key.

## How it works

```text
Angular CopilotKit chat + store + frontend tools + A2UI catalog (unchanged)
  │ build-time runtime URL replacement (src/app/runtime-url.byok.ts)
  ▼ fetch /<base>/api/byok/copilotkit/{info,agent/default/...}
Service worker (byok/service-worker.ts): CopilotKit HTTP + SSE facade only
  │ per-request MessageChannel to the requesting tab
Tab-owned bridge (src/app/macroquest/application/byok-runtime.ts)
  │ per-request MessageChannel
Dedicated module worker (byok/agent-worker.ts)
  ├─ browser agent with BuiltInAgent semantics (byok/agent.ts)
  ├─ local analyze_meal tool: photo or description → meal draft JSON
  ├─ @ag-ui/a2ui-middleware and OpenGenerativeUIMiddleware, as on the Node runtime
  └─ OpenAI-compatible client → OpenRouter or Gemini, Authorization: Bearer <key>
```

The system prompt, `analyze_meal` tool and `maxSteps` are shared with
`server/agent.ts` through `contracts/macroquest-agent.ts`. Frontend tools
(`add_meal_to_log`, `show_previous_day`, `show_next_day`) end the run and are
executed by the client, exactly as with the Node runtime.

## Providers and keys

| Provider      | Endpoint                                               | Default model             |
| ------------- | ------------------------------------------------------ | ------------------------- |
| Google Gemini | `generativelanguage.googleapis.com/v1beta/openai`      | `gemini-3.8-flash`        |
| OpenRouter    | `openrouter.ai/api/v1`                                 | `google/gemini-3.8-flash` |

Both are OpenAI-compatible chat-completions APIs with tool calling, streaming,
image input and `response_format: json_schema`, which is everything the agent
uses. The model id is editable on the card.

The key is typed into the provider card, handed to the worker once over
`postMessage` and captured in the client closure (`byok/openai-compatible-model-client.ts`).
It is never written to storage, never appears in a URL and is sent in the
`Authorization` header to the chosen endpoint only. **Change provider**
terminates the worker and the key with it. The service worker never sees it.

## Robustness

- Tool-call arguments that are not valid JSON go through `jsonrepair`; a call
  that still cannot be read is handed back to the model once as a correction
  turn, and only a second failure ends the run.
- `render_a2ui` arguments are validated (flat ids, root, catalog component
  names) and fed back for up to three attempts, mirroring the runtime's A2UI
  recovery; afterwards the client shows the failed surface with its errors.
- `add_meal_to_log` drafts are validated against the shared schema before the
  store accepts them. The meal lands in the log as a draft: flagged in the
  timeline, left out of the day's totals, and confirmed by the user with
  "Confirm meal" after reviewing the portions.
- A2UI `add_meal` actions (the "Add to log" button on a `MealCard`, in the chat
  or in the Recommended meals area) are handled deterministically: the worker
  turns the action's context into one `add_meal_to_log` call without a model
  turn (`byok/user-actions.ts`). CopilotKit keeps the action attached to the
  follow-up run that carries the tool result, so each action is handled once;
  that follow-up run is a normal model turn that confirms the meal.

## Run and deploy

```bash
pnpm install
pnpm start:byok          # http://127.0.0.1:4303
pnpm build:byok          # deploy dist/angular-a2ui-macroquest/browser/ to any static host
```

Requires HTTPS or localhost (service workers). `scripts/build-byok.mjs`
bundles the service worker and the agent worker with esbuild into `tmp/byok`,
which the Angular build copies as assets.

## Verification

```bash
pnpm build
pnpm typecheck:byok
pnpm test:byok:unit
pnpm test:byok
```

Unit tests cover the agent (prompt layout, history conversion, local versus
frontend tools, step cap, guards, correction turns), the generative-UI
wrapper, run error and cancellation semantics, and the OpenAI-compatible
client (streaming, tool-call assembly, image input, JSON schema, repair, errors
without the key). Browser tests serve the static build under `/demo/` with a
scripted model fixture: connect flow, chat, `analyze_meal` → `add_meal_to_log`,
frontend tools, an A2UI surface, a generative-UI sandbox, cancellation and
disconnect. No model request is made in tests.
