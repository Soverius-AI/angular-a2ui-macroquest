/**
 * Environment and model-provider resolution for the MacroQuest runtime.
 *
 * Everything is read once at import time; the rest of the server imports the
 * resolved values and never touches process.env again. Loading dotenv here
 * (first import of this module graph) guarantees .env is applied before any
 * value below is computed.
 */
import "dotenv/config";

export const port = Number(process.env.PORT ?? 3210);

const modelProviderRaw =
  process.env.COPILOT_MODEL_PROVIDER?.trim().toLowerCase() || "local";
if (modelProviderRaw !== "local" && modelProviderRaw !== "openrouter") {
  throw new Error(
    `Unsupported COPILOT_MODEL_PROVIDER="${modelProviderRaw}". Use "local" or "openrouter".`,
  );
}
export const modelProvider = modelProviderRaw as "local" | "openrouter";

const localModelBaseUrl =
  process.env.LOCAL_MODEL_BASE_URL?.trim() ??
  process.env.LOCAL_LLAMA_BASE_URL?.trim() ??
  "http://127.0.0.1:8080/v1";
const localModelName =
  process.env.LOCAL_MODEL_NAME?.trim() ??
  process.env.LOCAL_LLAMA_MODEL?.trim() ??
  "gemma-4-26b-a4b-it-qat";
const localModelApiKey =
  process.env.LOCAL_MODEL_API_KEY?.trim() ??
  process.env.LOCAL_LLAMA_API_KEY?.trim() ??
  "local-llama";

export const maxOutputTokens = Number(
  process.env.LOCAL_MODEL_MAX_OUTPUT_TOKENS ??
    process.env.LOCAL_LLAMA_MAX_OUTPUT_TOKENS ??
    32768,
);

const openrouterBaseUrl = "https://openrouter.ai/api/v1";
const openrouterModel =
  process.env.OPENROUTER_MODEL?.trim() || "google/gemini-2.5-pro";
const openrouterApiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";

if (modelProvider === "openrouter" && !openrouterApiKey) {
  throw new Error(
    "COPILOT_MODEL_PROVIDER=openrouter requires OPENROUTER_API_KEY (see .env).",
  );
}

/** Active chat-completions target: local llama.cpp or OpenRouter. */
export const modelBaseUrl =
  modelProvider === "openrouter" ? openrouterBaseUrl : localModelBaseUrl;
export const modelName =
  modelProvider === "openrouter" ? openrouterModel : localModelName;
export const modelApiKey =
  modelProvider === "openrouter" ? openrouterApiKey : localModelApiKey;

process.env.OPENAI_BASE_URL = modelBaseUrl;

export const completionUrl = `${modelBaseUrl.replace(/\/$/, "")}/chat/completions`;
