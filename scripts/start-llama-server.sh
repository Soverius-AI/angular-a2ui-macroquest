#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Start a local llama.cpp OpenAI-compatible server for MacroQuest.

By default this uses the Unsloth Gemma 4 26B-A4B MoE QAT GGUF on Hugging Face. llama-server
downloads weights into the normal Hugging Face cache on first run when they are not
already present.

Usage:
  scripts/start-llama-server.sh [--dry-run] [--download-only] [--print-runtime-env]

Options:
  --dry-run             Print the commands without starting or downloading.
  --download-only       Use the hf CLI to prefetch the selected GGUF.
  --print-runtime-env   Print the runtime env vars and exit.
  -h, --help            Show this help.

Environment:
  LLAMA_MODEL           Model to load. Either:
                        - Hugging Face repo + GGUF filename:
                          org/repo/model-name.gguf
                        - Local filesystem path to a .gguf you already have
                        Default:
                          unsloth/gemma-4-26B-A4B-it-qat-GGUF/gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf
  LLAMA_MMPROJ_PATH     Optional multimodal projector path. Only used with a
                        local LLAMA_MODEL file (required for meal-photo vision
                        when not loading from Hugging Face).
  LLAMA_SERVER_BIN      llama-server binary. Default: first llama-server on PATH.
  LLAMA_HOST            Bind host. Default: 127.0.0.1
  LLAMA_PORT            Bind port. Default: 8080
  LLAMA_API_KEY         Optional API key. Default: empty (no auth; the server
                        binds to localhost). Setting a key also locks out the
                        built-in chat web UI at http://host:port/ until you
                        paste the key into its settings.
  LLAMA_ALIAS           OpenAI model id exposed by llama-server.
                        Default: gemma-4-26b-a4b-it-qat
  LLAMA_CONTEXT_SIZE    Context size. Default: 131072
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
  LOCAL_MODEL_NAME=gemma-4-26b-a4b-it-qat
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

LLAMA_MODEL="${LLAMA_MODEL:-unsloth/gemma-4-26B-A4B-it-qat-GGUF/gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf}"
LLAMA_MMPROJ_PATH="${LLAMA_MMPROJ_PATH:-}"

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
LLAMA_ALIAS="${LLAMA_ALIAS:-gemma-4-26b-a4b-it-qat}"
LLAMA_CONTEXT_SIZE="${LLAMA_CONTEXT_SIZE:-131072}"
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

resolve_model() {
  if [[ -f "$LLAMA_MODEL" ]]; then
    use_local_model=1
    local_model_path="$LLAMA_MODEL"
    return 0
  fi

  if [[ "$LLAMA_MODEL" == */*.gguf ]]; then
    use_local_model=0
    hf_model_file="${LLAMA_MODEL##*/}"
    hf_model_repo="${LLAMA_MODEL%/*}"
    if [[ -z "$hf_model_repo" || -z "$hf_model_file" ]]; then
      echo "Invalid LLAMA_MODEL Hugging Face value: $LLAMA_MODEL" >&2
      echo "Expected org/repo/model-name.gguf" >&2
      exit 1
    fi
    return 0
  fi

  echo "LLAMA_MODEL must be a local .gguf file or org/repo/model-name.gguf" >&2
  echo "Got: $LLAMA_MODEL" >&2
  exit 1
}

if [[ "$print_runtime_env" -eq 1 ]]; then
  print_env
  exit 0
fi

use_local_model=0
local_model_path=""
hf_model_repo=""
hf_model_file=""
resolve_model

if [[ "$download_only" -eq 1 && "$use_local_model" -eq 1 ]]; then
  echo "--download-only is not compatible with a local LLAMA_MODEL file." >&2
  exit 2
fi

download_cmd=()
if [[ "$download_only" -eq 1 ]]; then
  if ! command -v hf >/dev/null 2>&1; then
    echo "The hf CLI is required for --download-only. Install it with: brew install hf" >&2
    exit 1
  fi

  download_cmd=(hf download "$hf_model_repo" "$hf_model_file")
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
  --image-max-tokens "$LLAMA_IMAGE_MAX_TOKENS"
  --reasoning "$LLAMA_REASONING"
  --reasoning-budget "$LLAMA_REASONING_BUDGET"
)

if [[ "$use_local_model" -eq 1 ]]; then
  server_cmd+=(--model "$local_model_path")
  if [[ -n "$LLAMA_MMPROJ_PATH" ]]; then
    if [[ ! -f "$LLAMA_MMPROJ_PATH" ]]; then
      echo "LLAMA_MMPROJ_PATH does not point to a file: $LLAMA_MMPROJ_PATH" >&2
      exit 1
    fi
    server_cmd+=(--mmproj "$LLAMA_MMPROJ_PATH")
  fi
else
  server_cmd+=(
    --mmproj-auto
    --hf-repo "$hf_model_repo"
    --hf-file "$hf_model_file"
  )
fi

if [[ -n "$LLAMA_API_KEY" ]]; then
  server_cmd+=(--api-key "$LLAMA_API_KEY")
fi
if [[ -n "$LLAMA_THREADS" ]]; then
  server_cmd+=(--threads "$LLAMA_THREADS")
fi
if [[ -n "$LLAMA_GPU_LAYERS" ]]; then
  server_cmd+=(--gpu-layers "$LLAMA_GPU_LAYERS")
fi

if [[ "$use_local_model" -eq 1 ]]; then
  echo "Model: local file $local_model_path"
  if [[ -n "$LLAMA_MMPROJ_PATH" ]]; then
    echo "mmproj: $LLAMA_MMPROJ_PATH"
  else
    echo "mmproj: not set (meal-photo vision may not work with a local GGUF)"
  fi
else
  echo "Model: $hf_model_repo/$hf_model_file"
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
