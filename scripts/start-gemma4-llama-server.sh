#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Start a local llama.cpp OpenAI-compatible server for the MacroQuest Gemma 4 demo.

This script uses llama-server's Hugging Face integration so the GGUF model is
downloaded into the normal Hugging Face cache on first run.

Usage:
  scripts/start-gemma4-llama-server.sh [--dry-run] [--download-only] [--print-runtime-env]

Options:
  --dry-run             Print the commands without starting or downloading.
  --download-only       Use the hf CLI to prefetch the selected Gemma 4 GGUF.
  --print-runtime-env   Print the runtime env vars and exit.
  -h, --help            Show this help.

Environment:
  GEMMA4_HF_REPO        Hugging Face GGUF repo.
                        Default: ggml-org/gemma-4-12B-it-GGUF
  GEMMA4_QUANT          Quant suffix used by llama-server --hf-repo.
                        Default: Q8_0
  GEMMA4_HF_FILE        Optional exact GGUF filename. Overrides GEMMA4_QUANT.
  LLAMA_SERVER_BIN      llama-server binary. Default: first llama-server on PATH.
  LLAMA_HOST            Bind host. Default: 127.0.0.1
  LLAMA_PORT            Bind port. Default: 8080
  LLAMA_API_KEY         Optional API key. Default: empty (no auth; the server
                        binds to localhost). Setting a key also locks out the
                        built-in chat web UI at http://host:port/ until you
                        paste the key into its settings.
  LLAMA_ALIAS           OpenAI model id exposed by llama-server.
                        Default: gemma-4-12b-it
  LLAMA_CONTEXT_SIZE    Context size. Default: 32768
  LLAMA_PARALLEL        Number of llama-server slots. Default: 1
  LLAMA_UBATCH_SIZE     Physical batch size for prompt/image encoding.
                        Default: 2048
  LLAMA_IMAGE_MAX_TOKENS  Image token cap for dynamic-resolution vision models.
                        Default: 560
  LLAMA_REASONING       Reasoning mode passed to llama-server.
                        Default: off
  LLAMA_REASONING_BUDGET  Token budget for hidden thinking.
                        Default: 0
  LLAMA_THREADS         Optional CPU thread count.
  LLAMA_GPU_LAYERS      Optional GPU layer count, e.g. auto or all.
  HF_TOKEN              Optional Hugging Face token for gated/private repos.

Runtime pairing:
  LOCAL_MODEL_BASE_URL=http://127.0.0.1:8080/v1
  LOCAL_MODEL_NAME=gemma-4-12b-it
  LOCAL_MODEL_API_KEY=local-llama
  pnpm run start:runtime
USAGE
}

dry_run=0
download_only=0
print_runtime_env=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      dry_run=1
      shift
      ;;
    --download-only)
      download_only=1
      shift
      ;;
    --print-runtime-env)
      print_runtime_env=1
      shift
      ;;
    --)
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

GEMMA4_HF_REPO="${GEMMA4_HF_REPO:-ggml-org/gemma-4-12B-it-GGUF}"
GEMMA4_QUANT="${GEMMA4_QUANT:-Q8_0}"
GEMMA4_HF_FILE="${GEMMA4_HF_FILE:-}"

LLAMA_SERVER_BIN="${LLAMA_SERVER_BIN:-}"
if [[ -z "$LLAMA_SERVER_BIN" ]]; then
  LLAMA_SERVER_BIN="$(command -v llama-server || true)"
fi

LLAMA_HOST="${LLAMA_HOST:-127.0.0.1}"
LLAMA_PORT="${LLAMA_PORT:-8080}"
# No API key by default: the server binds to localhost, and llama-server's
# built-in chat web UI at / cannot authenticate itself, so a key just breaks
# it with "Invalid API Key". Export LLAMA_API_KEY to opt back in.
LLAMA_API_KEY="${LLAMA_API_KEY:-}"
LLAMA_ALIAS="${LLAMA_ALIAS:-gemma-4-12b-it}"
LLAMA_CONTEXT_SIZE="${LLAMA_CONTEXT_SIZE:-32768}"
LLAMA_PARALLEL="${LLAMA_PARALLEL:-1}"
LLAMA_UBATCH_SIZE="${LLAMA_UBATCH_SIZE:-2048}"
LLAMA_IMAGE_MAX_TOKENS="${LLAMA_IMAGE_MAX_TOKENS:-560}"
LLAMA_REASONING="${LLAMA_REASONING:-off}"
LLAMA_REASONING_BUDGET="${LLAMA_REASONING_BUDGET:-0}"
LLAMA_THREADS="${LLAMA_THREADS:-}"
LLAMA_GPU_LAYERS="${LLAMA_GPU_LAYERS:-}"

if [[ -z "$LLAMA_SERVER_BIN" && "$print_runtime_env" -eq 0 ]]; then
  echo "llama-server was not found on PATH. Install or upgrade llama.cpp first:" >&2
  echo "  brew install llama.cpp" >&2
  exit 1
fi

if [[ "$LLAMA_HOST" == "0.0.0.0" || "$LLAMA_HOST" == "::" ]]; then
  runtime_host="127.0.0.1"
else
  runtime_host="$LLAMA_HOST"
fi

runtime_base_url="http://${runtime_host}:${LLAMA_PORT}/v1"

print_env() {
  printf 'LOCAL_MODEL_BASE_URL=%s\n' "$runtime_base_url"
  printf 'LOCAL_MODEL_NAME=%s\n' "$LLAMA_ALIAS"
  if [[ -n "$LLAMA_API_KEY" ]]; then
    printf 'LOCAL_MODEL_API_KEY=%s\n' "$LLAMA_API_KEY"
  fi
}

if [[ "$print_runtime_env" -eq 1 ]]; then
  print_env
  exit 0
fi

model_ref="$GEMMA4_HF_REPO"
if [[ -z "$GEMMA4_HF_FILE" && "$model_ref" != *:* ]]; then
  model_ref="${model_ref}:${GEMMA4_QUANT}"
fi

download_cmd=()
if [[ "$download_only" -eq 1 ]]; then
  if ! command -v hf >/dev/null 2>&1; then
    echo "The hf CLI is required for --download-only. Install it with: brew install hf" >&2
    exit 1
  fi

  download_cmd=(hf download "$GEMMA4_HF_REPO")
  if [[ -n "$GEMMA4_HF_FILE" ]]; then
    download_cmd+=("$GEMMA4_HF_FILE")
  else
    download_cmd+=(--include "*${GEMMA4_QUANT}*.gguf")
  fi
  if [[ "$dry_run" -eq 1 ]]; then
    download_cmd+=(--dry-run)
  fi
fi

server_cmd=(
  "$LLAMA_SERVER_BIN"
  --host "$LLAMA_HOST"
  --port "$LLAMA_PORT"
  --alias "$LLAMA_ALIAS"
  --ctx-size "$LLAMA_CONTEXT_SIZE"
  --parallel "$LLAMA_PARALLEL"
  --ubatch-size "$LLAMA_UBATCH_SIZE"
  --jinja
  --mmproj-auto
  --image-max-tokens "$LLAMA_IMAGE_MAX_TOKENS"
  --reasoning "$LLAMA_REASONING"
  --reasoning-budget "$LLAMA_REASONING_BUDGET"
  --hf-repo "$model_ref"
)

if [[ -n "$LLAMA_API_KEY" ]]; then
  server_cmd+=(--api-key "$LLAMA_API_KEY")
fi
if [[ -n "$GEMMA4_HF_FILE" ]]; then
  server_cmd+=(--hf-file "$GEMMA4_HF_FILE")
fi
if [[ -n "$LLAMA_THREADS" ]]; then
  server_cmd+=(--threads "$LLAMA_THREADS")
fi
if [[ -n "$LLAMA_GPU_LAYERS" ]]; then
  server_cmd+=(--gpu-layers "$LLAMA_GPU_LAYERS")
fi

echo "Gemma 4 model: $model_ref"
if [[ -n "$GEMMA4_HF_FILE" ]]; then
  echo "Gemma 4 file: $GEMMA4_HF_FILE"
fi
echo "Runtime environment for MacroQuest:"
print_env
echo

if [[ "$download_only" -eq 1 ]]; then
  printf 'Download command:'
  printf ' %q' "${download_cmd[@]}"
  printf '\n'
  if [[ "$dry_run" -eq 0 ]]; then
    "${download_cmd[@]}"
  fi
  exit 0
fi

printf 'Server command:'
printf ' %q' "${server_cmd[@]}"
printf '\n'

if [[ "$dry_run" -eq 1 ]]; then
  exit 0
fi

exec "${server_cmd[@]}"
