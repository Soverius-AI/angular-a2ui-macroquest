# MacroQuest Angular A2UI Demo

MacroQuest is an Angular demo app for showing CopilotKit Angular A2UI,
CopilotKit chat controls, NgRx Signal Store, and a local Gemma 4 model server.

Gemma authors both the A2UI component tree and the complete Open Generative UI
sandbox payload. The runtime validates A2UI, streams sandbox tool arguments,
and lets CopilotKit render the result through its standard middleware and
Angular renderer.

## Configuration

Install the dependencies via pnpm:

```bash
pnpm install
```

Install llama.cpp to run the local Gemma 4 model server:

```bash
brew install llama.cpp
```

Download the Gemma 4 model weights by starting llama.cpp:

```bash
pnpm run start:llama
```

The script defaults to the Unsloth Gemma 4 26B-A4B MoE QAT GGUF on Hugging Face.
On first run, `llama-server` downloads weights into the normal Hugging Face cache
when they are not already present:

```bash
llama-server \
  --hf-repo unsloth/gemma-4-26B-A4B-it-qat-GGUF \
  --hf-file gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf \
  --alias gemma-4-26b-a4b-it-qat \
  --host 127.0.0.1 \
  --port 8080
```

To use a GGUF you already have on disk instead of downloading from Hugging Face:

```bash
LLAMA_MODEL=/path/to/your-model.gguf \
LLAMA_MMPROJ_PATH=/path/to/mmproj-F16.gguf \
LLAMA_ALIAS=your-model-alias \
pnpm run start:llama
```

`LLAMA_MMPROJ_PATH` is only needed for the local-file override when you want
meal-photo vision. The default Hugging Face path uses `--mmproj-auto`.

If Hugging Face requires authentication for a selected repo or file, export
`HF_TOKEN` before starting the server.

## Start everything

Run llama.cpp, the CopilotKit runtime, and the Angular app in one terminal:

```bash
pnpm run start:all
```

Then open `http://127.0.0.1:4302`. Ctrl+C stops all three processes.

You can still start them separately with `pnpm run start:llama`,
`pnpm run start:runtime`, and `pnpm run start:ui`.

## OpenRouter (same agentic UI, remote model)

The MacroQuest **custom agent** (intent routing, A2UI catalog surfaces, sandbox
widgets) runs for both local llama.cpp and OpenRouter. Switching provider only
changes which OpenAI-compatible `/chat/completions` endpoint is called.

Set your key and model in `.env` (gitignored):

```bash
cp .env.example .env
# edit .env — set OPENROUTER_API_KEY and optionally OPENROUTER_MODEL
```

Then run:

```bash
pnpm run start:all:openrouter
```

Relevant variables:

| Variable                 | Purpose                                    |
| ------------------------ | ------------------------------------------ |
| `COPILOT_MODEL_PROVIDER` | `local` or `openrouter`                    |
| `OPENROUTER_API_KEY`     | Your OpenRouter API key                    |
| `OPENROUTER_MODEL`       | Model id (default `google/gemini-2.5-pro`) |

With `COPILOT_MODEL_PROVIDER=openrouter`, meal analysis still emits A2UI catalog
trees (`cpk-a2ui-surface` in chat) and the lighter-swap sandbox still works —
no local llama required.

## Runtime

```bash
LOCAL_MODEL_BASE_URL=http://127.0.0.1:8080/v1 \
LOCAL_MODEL_NAME=gemma-4-26b-a4b-it-qat \
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

For sandbox requests, the runtime does not construct HTML or substitute a
fallback widget. It streams Gemma's grammar-constrained
`generateSandboxedUi` arguments in CopilotKit's required order:
`initialHeight`, `placeholderMessages`, `css`, `html`, `jsFunctions`, then
`jsExpressions`. CopilotKit progressively renders the CSS/HTML and then runs
the model-authored behavior in `@jetbrains/websandbox`.

## Angular App

```bash
pnpm run start:ui
```

Open `http://127.0.0.1:4302`.

## Generating UI: Prompt Sequence

> For the full architecture walkthrough, prompt inventory, and the complete
> six-step demo runbook, see [docs/PRESENTATION.md](docs/PRESENTATION.md).

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

3. **Model-authored chart — visualize progress.** Gemma generates a compact
   dashboard with KPI cards, two self-contained inline SVG charts, and a working
   percentage/absolute toggle. No chart markup or chart library configuration
   is hardcoded in the server.

   ```text
   Show me a chart of my macros versus my goals.
   ```

> A selected meal gives the best result. The generated action also carries the
> literal source macros, so a restored Swap Lab can still apply after the host
> selection or meal list has been reset.

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
pnpm run start:llama -- --dry-run
```
