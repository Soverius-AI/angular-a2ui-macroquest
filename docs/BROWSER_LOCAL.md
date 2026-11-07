# Browser-local Gemma 4 E2B with Transformers.js

## Implementation

Feature branch: `feature/browser-local-transformers-gemma4`, based on `main` at
feature start. The repository contains model references, not model weights:
the browser downloads the pinned ONNX artifact only after explicit consent.

The browser path now uses **Transformers.js + ONNX Runtime Web** and the same
ONNX artifact as [Soverius-AI/ai-rag-basic](https://github.com/Soverius-AI/ai-rag-basic).
The earlier inference dependencies and loaders have been removed; there is no
parallel WebLLM/MLC runtime or alternate model fallback.

The service worker still implements CopilotKit's HTTP/SSE contract. The existing
Angular chat components, frontend tools, Signal Store and sandbox RPC remain
unchanged. A tab-owned dedicated module worker owns model state and injects the
new model client into the shared MacroQuest agent.

## Exact runtime and artifact

| Setting                    | Value                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| Transformers.js            | **`@huggingface/transformers@4.3.2`**, latest stable npm version checked during implementation |
| ONNX Runtime Web           | **`1.31.0-dev.20260914-8d85527a0`**, the exact dependency selected by Transformers.js 4.3.2    |
| Model                      | **`onnx-community/gemma-4-E2B-it-ONNX`**                                                       |
| Model + tokenizer revision | **`6f21c99d7e18237f8d2ce92aadfdbfeba877f63a`**                                                 |
| Model class                | `Gemma4ForConditionalGeneration`                                                               |
| Tokenizer                  | `AutoTokenizer`                                                                                |
| Preferred execution        | WebGPU, `dtype: 'q4f16'`, requires `shader-f16`                                                |
| Optional fallback          | Local WASM/CPU, `dtype: 'q4'`                                                                  |
| Streaming                  | `TextStreamer`, skipping prompt and special tokens                                             |
| Decoding                   | `do_sample: false`; chat-template `enable_thinking: false`                                     |

The reference repository's checked commit `e657384` uses Transformers.js 4.2.0.
This project deliberately uses the **latest stable Transformers.js** requested
by the user, while keeping the same model repository and loader/class/quantization
choices. Its matching ORT dependency is therefore newer than the reference's.
Do not independently override ORT or mix WASM files from another version.

Both tokenizer and model are pinned to one immutable revision. The same repo
contains the `q4f16` and `q4` ONNX graphs/external data; neither is a GGUF or MLC
conversion. The reviewed f16 files include separate embedding and decoder data
files of about 1,517 MiB and 1,449 MiB, plus smaller encoder/configuration files.
Actual downloaded assets depend on what the SDK loads for the selected device.

References:

- [Transformers.js documentation](https://huggingface.co/docs/transformers.js)
- [Published SDK](https://www.npmjs.com/package/@huggingface/transformers/v/4.3.2)
- [Pinned ONNX model](https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX/tree/6f21c99d7e18237f8d2ce92aadfdbfeba877f63a)
- [Reference worker](https://github.com/Soverius-AI/ai-rag-basic/blob/e657384a8f5baac9ad3cd0b09845be5edf3f56c9/src/app/workers/llm.worker.ts)

## Run — no inference backend

```bash
pnpm install
pnpm start:browser-local
# http://127.0.0.1:4303
```

Only Angular's file-serving dev server starts. No Hono runtime, llama.cpp process,
API key, server function or remote inference endpoint is required. Do not use
`start:all` for this mode.

The setup page does not download weights until consent. Review the selected
model's license, choose caching/fallback options, and select **Load model locally**.

- **Cache model files** uses the SDK's actual `env.useBrowserCache` and
  `env.useWasmCache` settings. Disable it when disk space/browser quota is low.
  This is supported by Transformers.js; it is not a no-op checkbox or a global
  browser-storage monkey patch. No-cache loading still downloads weights into
  memory, and a reload needs another download.
- **Allow WASM / CPU fallback** matches the reference worker's fallback strategy.
  The adapter first checks for a WebGPU adapter with `shader-f16`, then attempts
  `q4f16`. If unavailable or GPU loading fails, it loads `q4` on WASM only when
  permitted. This may download additional weights. Disable this option to
  require WebGPU instead of waiting for slow CPU inference.
- The readiness message and dashboard banner report the **actual selected
  execution device**, not an unconditional GPU label.
- Keep one model tab open. Closing/reloading it discards the engine and pending
  meal drafts. Browser-cache eviction can require re-downloading files.

A modern browser, HTTPS/localhost, service workers, dedicated workers and enough
RAM are required. WebGPU also needs a compatible GPU/driver with `shader-f16` and
sufficient device limits/memory. Cache writes additionally need free disk space
and browser quota; a reported quota does not guarantee a write can succeed under
low-disk reserve policies. The feature does not delete unrelated browser caches,
site data or local model files to make room.

## Static deployment

```bash
pnpm build:browser-local
# Deploy dist/angular-a2ui-macroquest/browser/ to an HTTPS static host.
```

For a subpath:

```bash
pnpm prepare:browser-local
pnpm exec ng build --configuration production,browser-local --base-href /macroquest/
```

Deploy the entire output: Angular files, `browser-local-sw.js`,
`browser-local/agent-worker.js` and generated JS chunks, plus `browser-local/ort/`.
The build copies the WASM/loader files from the **installed SDK's exact ORT
package**, resolved through that package's dependency graph. Builds do not fetch
or include model weights.

The adapter explicitly configures same-origin
`ort-wasm-simd-threaded.asyncify.mjs` and `.wasm` URLs, matching the 4.3.2 SDK's
asyncify choice. It sets `numThreads: 1` and `proxy: false`, so ordinary static
hosting does not require cross-origin isolation/SharedArrayBuffer. Heavy work
already runs in the dedicated worker. Do not infer that "threaded" in the asset
filename means multiple WASM threads are enabled.

Serve `.js` **and `.mjs`** as JavaScript and `.wasm` as `application/wasm`.
Do not rewrite missing worker/API/runtime paths to `index.html`. Give the root
service-worker script revalidation/`Cache-Control: no-cache`. It must live at the
application base to control that scope. Hugging Face model hosts need CORS access.
A deployment CSP must permit the chosen model host, worker/WASM compilation, and
any SDK-required blob loader URLs.

The API namespace is app-base-relative `api/browser-local/copilotkit/*`. A stale
worker does not intercept the Node-backed `/api/copilotkit/*` endpoint. Other
assets use ordinary requests. This is not an app-shell offline cache or an
air-gapped deployment. To uninstall, unregister `browser-local-sw.js` in developer
tools and reload. To remove downloaded models, deliberately clear the relevant
origin's Transformers.js model cache. Old runtime caches are not automatically
removed.

## Architecture

```text
Existing Angular CopilotKit chat + Signal Store + frontend tools
  │ same SDK; build-time runtime URL replacement
  ▼ fetch /<base>/api/browser-local/copilotkit/{info,agent/default/...}
Service worker: HTTP + SSE only
  │ per-request MessageChannel directed to requesting tab
Tab-owned transport bridge
  │ per-request MessageChannel
Dedicated module worker
  ├─ shared MacroQuest workflow + activity-envelope translation
  └─ Transformers.js
       ├─ AutoTokenizer + Gemma4ForConditionalGeneration
       ├─ pinned ONNX artifact / external tensor data from Hugging Face
       └─ matching self-hosted ONNX Runtime Web → WebGPU or allowed WASM
```

GPU/model state survives service-worker suspension, not a tab reload. The worker
handles one run at a time. Cancellation uses `InterruptableStoppingCriteria`;
cleanup waits for in-flight generation before disposal. Input/output tensors are
released. Worker crashes reset readiness and allow setup retry. Fetch aborts,
heartbeats, timeouts and explicit terminal events prevent abandoned SSE streams
from hanging indefinitely.

The service worker implements `GET /info`, `POST /agent/default/run`, `/connect`,
and `/stop/:threadId`, using standard `data: JSON\n\n` SSE frames. It advertises no
thread CRUD, transcription or dynamic suggestions. The browser agent owns chat
history/state; connect mirrors the supplied values rather than a durable
server-side replay store.

The shared agent retains routing, prompts, meal semantic validation and
thread-scoped pending-draft/apply idempotency. Node still injects its existing
HTTP model client. Browser output becomes the same `a2ui-surface` and
`open-generative-ui` activities. Internal render tools are consumed locally;
`logMealDraft` and `setMacroGoals` remain normal frontend tools. No UI layout,
chart or widget fallback was added to the transport.

## Structured output and trust boundary

- This is a **text-only integration**, despite the model class/artifact's broader
  capabilities. Photo requests are explicitly rejected before generation.
- Plain chat streams real `TextStreamer` callbacks. All generation is greedy and
  thinking is disabled, matching the reference worker.
- Unlike the previous runtime's grammar API, this adapter supplies the original
  JSON schema in the prompt, parses JSON (including a single Markdown fence),
  validates with Zod, and allows one validation-feedback retry. It does **not**
  claim arbitrary JSON-schema grammar enforcement by ONNX generation.
- Sandbox JSON is buffered and validated as a complete payload before executable
  content is exposed. The full activity replaces the backend's progressive
  preview; the model remains the author of all layout and behavior.
- Prompts plus requested output have an 8,192-token application budget; output is
  bounded to 3,000 tokens. Oversized prompts and token-limit exhaustion fail
  explicitly instead of silently accepting incomplete JSON. The duplicate SDK
  catalog context is omitted because the shared prompt/schema already specifies
  supported components; trusted application state is retained.
- Generated code runs only in the existing opaque-origin CopilotKit/JetBrains
  sandbox, with a fixed restrictive CSP envelope. Store changes use the validated
  `Websandbox.connection.remote.applyMacroSwap` RPC, never browser storage,
  cookies or same-origin state lookups. CSP is defense in depth, not a proof
  that arbitrary generated JavaScript is safe.
- No prompts/app state go to an inference backend. Normal model/static asset
  downloads still use the network. Model quality, GPU-device-loss recovery and
  throughput require live verification on target hardware.

## Verification

```bash
pnpm build
pnpm typecheck:browser-local
pnpm test:browser-local:unit
pnpm test:browser-local
# Use installed Chrome if Playwright's bundled browser is absent:
PLAYWRIGHT_CHANNEL=chrome pnpm test:browser-local
```

Unit tests cover injected workflow/protocol behavior and a mock Transformers.js
model/tokenizer: schema prompting and retry, strict/fenced JSON validation,
greedy/thinking-disabled generation, streaming, interruption, concurrency,
disposal/tensor cleanup, no-cache configuration and sandbox buffering.

Browser tests serve static files under `/demo/`. Compile-time fixtures exercise
consent/no-auto-download, chat, A2UI apply → frontend tool → store updates,
sandbox keyboard interaction/CSP, cancellation and the GPU-required error path.
A real published browser-SDK module-worker probe checks the model/tokenizer
loaders, streaming/interruption classes, version, no-cache settings, and deployment
of matching ORT assets/MIME types. It does not call `from_pretrained` or fetch LLM
weights.

Fixtures are generated only into `tmp/browser-local-test`, never production
output. There is no production mock flag. Passing fixture/SDK-import tests is
not a claim that live ONNX model generation has passed.
