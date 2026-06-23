# MacroQuest Angular A2UI Demo

MacroQuest is an ignored Angular demo app for showing CopilotKit Angular A2UI,
CopilotKit chat controls, NgRx Signal Store, and a local Gemma 4 model server.
Gemma authors the A2UI component tree; the CopilotKit runtime backend validates
and forwards it through A2UI middleware so Angular renders the Lit-backed
`cpk-a2ui-surface` web component.

## Install

Use the pinned Node version:

```bash
nvm use
```

The demo has its own ignored `pnpm-workspace.yaml` so local CopilotKit
`workspace:*` dependencies resolve without changing the repository root
workspace.

```bash
pnpm install
pnpm exec playwright install chromium
```

## Local Gemma 4 Server

Install or upgrade llama.cpp:

```bash
brew install llama.cpp
# or
brew upgrade llama.cpp
```

Start the Gemma 4 OpenAI-compatible server:

```bash
pnpm run start:llama:gemma4
```

The script defaults to:

```bash
llama-server \
  --hf-repo ggml-org/gemma-4-12B-it-GGUF:Q8_0 \
  --alias gemma-4-12b-it \
  --host 127.0.0.1 \
  --port 8080
```

Useful variants:

```bash
pnpm run start:llama:gemma4 -- --dry-run
pnpm run start:llama:gemma4 -- --download-only
GEMMA4_QUANT=Q4_K_M pnpm run start:llama:gemma4
GEMMA4_HF_FILE=gemma-4-12B-it-Q8_0.gguf pnpm run start:llama:gemma4
```

The 12B Q8_0 weights are roughly 13 GB. On smaller machines use
`GEMMA4_QUANT=Q4_K_M`, or point `GEMMA4_HF_REPO` back at
`ggml-org/gemma-4-E2B-it-GGUF` with `LLAMA_ALIAS=gemma-4-e2b-it`.

If Hugging Face requires authentication for a selected repo or file, export
`HF_TOKEN` before starting the server.

## Runtime

```bash
LOCAL_MODEL_BASE_URL=http://127.0.0.1:8080/v1 \
LOCAL_MODEL_NAME=gemma-4-12b-it \
LOCAL_MODEL_API_KEY=local-llama \
pnpm run start:runtime
```

The runtime also defaults to these Gemma 4 settings, so the explicit env vars
are mainly documentation and useful when switching ports.

The runtime is a local Hono wrapper around `@copilotkit/runtime/v2`. It should
not construct the A2UI layout itself. The local Gemma response must include:

```json
{
  "mealDraft": { "title": "...", "items": [] },
  "a2ui": { "surfaceId": "...", "components": [], "data": {} }
}
```

The backend validates the model-generated catalog tree, emits the A2UI render
tool call through CopilotKit middleware, and the Angular SDK renders the
resulting `a2ui-surface` activity.

## Angular App

```bash
pnpm run start:ui
```

Open `http://127.0.0.1:4300`.

## Generating UI: Prompt Sequence

The demo renders model-generated UI two different ways. Run these prompts in
order from the chat panel (or click the matching starter suggestions).

1. **Rich A2UI surface — analyze a meal.** Gemma authors an A2UI component tree
   that Angular renders through the Lit-backed `cpk-a2ui-surface`, and logs the
   draft into `MacroQuestStore` via the `logMealDraft` frontend tool.

   ```text
   Analyze a grilled chicken bowl with rice and beans.
   ```

   A rich, model-generated meal card appears in the chat and the dashboard
   updates with the new draft as the selected meal.

2. **Sandboxed Open Generative UI — follow up with a lighter swap.** With the
   meal from step 1 selected, ask for a lighter version. The model generates an
   interactive UI inside the `@jetbrains/websandbox` iframe whose controls call
   the `applyMacroSwap` sandbox function to write the swap back into the store.

   ```text
   Suggest a lighter version of my current meal.
   ```

   Applying the swap from the generated sandbox UI updates the selected meal's
   macros in `MacroQuestStore` (and the dashboard) in place.

> The follow-up depends on step 1: `applyMacroSwap` needs a selected meal, so run
> the analyze prompt first — otherwise the sandbox reports "Analyze or select a
> meal before applying a sandbox swap."

## Source Layout

The Angular source is split as one feature area:

```text
src/app/macroquest/
  domain/       Pure nutrition types, calculations, meal factory, sample data
  application/  NgRx Signal Store and CopilotKit frontend tool registration
  ui/           Standalone Angular components with signal inputs and outputs
```

The root `App` only mounts `<mq-shell />`. `MacroQuestStore` is composed from
`signalStoreFeature` slices: `withMacroQuest` holds the trusted nutrition state
and its derived signals, and `withCopilot` registers the CopilotKit chat/tool
wiring. The Open Generative UI sandbox bridge lives in `macroquest-sandbox.ts`.

## Verification

Build the app:

```bash
pnpm run build
```

Run the browser integration test:

```bash
pnpm run test:integration
```

Record and verify the real image workflow:

```bash
node scripts/record-real-web-image-workflow.mjs
```

This checks that the chat renders a Lit-backed A2UI activity surface from the
model-generated A2UI tool payload.

Print the model server command without downloading:

```
pnpm run start:llama:gemma4 -- --dry-run
```
