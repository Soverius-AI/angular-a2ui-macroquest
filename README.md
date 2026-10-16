# MacroQuest

This branch is the talk's starting point. MacroQuest is an Angular meal log
with a CopilotKit chat and a local Gemma 4 model server. The meal log lives in
one service. The agent answers questions from a system prompt. The meal-log
snapshot is not attached yet.
The later beats (a frontend tool, human in the loop, A2UI, and Open Generative
UI) are written down in `talk-script.md` and are not in this branch.

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

## OpenRouter (same chat agent, remote model)

The chat agent runs for both local llama.cpp and OpenRouter. Switching provider
only changes which OpenAI-compatible `/chat/completions` endpoint is called.

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

With `COPILOT_MODEL_PROVIDER=openrouter`, the same chat agent answers. No local
llama server is required.

## Runtime

```bash
LOCAL_MODEL_BASE_URL=http://127.0.0.1:8080/v1 \
LOCAL_MODEL_NAME=gemma-4-26b-a4b-it-qat \
LOCAL_MODEL_API_KEY=local-llama \
pnpm run start:runtime
```

The runtime also defaults to these Gemma 4 settings, so the explicit env vars
are mainly documentation and useful when switching ports.

The runtime is a local Hono wrapper around `@copilotkit/runtime/v2`. Each run
streams a chat reply from the system prompt. The meal-log snapshot is not
attached yet.

## Angular App

```bash
pnpm run start:ui
```

Open `http://127.0.0.1:4302`.

## Talk

The meal log loads on startup. Ask the chat a question. The two starter prompts are
"What does this app track?" and "How much can I still eat today?" The full
sequence is in `talk-script.md`.

## Source Layout

The Angular source is split as one feature area:

```text
src/app/macroquest/
  domain/       Pure nutrition types, calculations, meal factory, sample data
  application/  Meal-log service
  ui/           Standalone Angular components with signal inputs and outputs
```

The root `App` only mounts `<mq-shell />`. `MacroQuestStore` holds the meal
log in one signal. The snapshot is not attached yet.

## Verification

Build the app:

```bash
pnpm run build
```

Run the browser integration test:

```bash
pnpm run test:integration
```

Print the model server command without downloading:

```
pnpm run start:llama -- --dry-run
```

## Meal nutrition in the solution chat

On `solution`, the Angular app uses the same A2UI basic catalog as `main`.
The runtime injects the `render_a2ui` tool into the built-in agent. After photo
analysis, or when asked to show a logged meal's nutrition, the agent uses the
existing meal data to generate a card inside the chat with foods, servings,
calories, protein, carbs, and fat.

The card only displays the estimate. Ask to add the meal to open the existing
human-in-the-loop confirmation; confirming saves it, and cancelling leaves the
meal log unchanged. Rendering a card does not analyze the photo again.

## Open Generative UI macro chart

Ask **"Show me a chart of my macros versus my goals."** The built-in agent
calls `generateSandboxedUi` with model-authored HTML, CSS, and JavaScript.
CopilotKit renders it in a sandbox inside the chat, with macro goal progress,
meal calorie contributions, and a percentage/absolute-value toggle.

Angular supplies precomputed daily totals, remaining macros, and per-meal
summaries for the active day. The chart shows a snapshot from that request;
ask for a new chart after changing the log or switching days. This example
does not expose store-changing functions to the sandbox.
