import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  BuiltInAgent,
  CopilotRuntime,
  createCopilotEndpoint,
  InMemoryAgentRunner,
} from "@copilotkit/runtime/v2";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type {
  AssistantMessage,
  Context,
  Message,
  ToolMessage,
  UserMessage,
} from "@ag-ui/core";
import {
  assistantCopy,
  buildChatSystemPrompt,
  buildGoalsExtractionPrompt,
  buildIntentClassificationPrompt,
  buildMacroChartPrompt,
  buildMacroSwapLabPrompt,
  buildMealUIPrompt,
} from "./prompts";
import {
  a2uiApplyActionSchema,
  intentResponseFormat,
  intentResultSchema,
  macroGoalsResponseFormat,
  macroGoalsSchema,
  mealUIResponseSchema,
  modelGeneratedMealUIResponseFormat,
  sandboxWidgetResponseFormat,
  sandboxWidgetSchema,
  type A2UISurface,
  type Intent,
  type MacroGoals,
  type MealItem,
  type MealUIResponse,
  type SandboxWidget,
} from "./schemas";

const port = Number(process.env.PORT ?? 3210);
const modelBaseUrl =
  process.env.LOCAL_MODEL_BASE_URL?.trim() ??
  process.env.LOCAL_LLAMA_BASE_URL?.trim() ??
  "http://127.0.0.1:8080/v1";
const modelName =
  process.env.LOCAL_MODEL_NAME?.trim() ??
  process.env.LOCAL_LLAMA_MODEL?.trim() ??
  "gemma-4-12b-it";
const modelApiKey =
  process.env.LOCAL_MODEL_API_KEY?.trim() ??
  process.env.LOCAL_LLAMA_API_KEY?.trim() ??
  "local-llama";
const maxOutputTokens = Number(
  process.env.LOCAL_MODEL_MAX_OUTPUT_TOKENS ??
    process.env.LOCAL_LLAMA_MAX_OUTPUT_TOKENS ??
    4096,
);

process.env.OPENAI_BASE_URL = modelBaseUrl;

const basicA2UICatalogId =
  "https://a2ui.org/specification/v0_9/basic_catalog.json";
const macroQuestA2UIToolName = "macroquest_render_a2ui";

type LoggedItem = MealItem & { id: string };
type MealDraft = {
  title: string;
  source: string;
  notes: string;
  items: LoggedItem[];
};

const completionUrl = `${modelBaseUrl.replace(/\/$/, "")}/chat/completions`;
const pendingMealDraftsBySurface = new Map<string, MealDraft>();
const appliedMealDraftActionKeys = new Set<string>();

// ---------------------------------------------------------------------------
// AG-UI message helpers
// ---------------------------------------------------------------------------

function userText(content: UserMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function userImageUrl(content: UserMessage["content"]): string | undefined {
  if (typeof content === "string") return undefined;
  const image = content.find((part) => part.type === "image");
  if (!image) return undefined;
  return image.source.type === "data"
    ? `data:${image.source.mimeType};base64,${image.source.value}`
    : image.source.value;
}

const isUser = (message: Message): message is UserMessage => message.role === "user";
const isAssistant = (message: Message): message is AssistantMessage =>
  message.role === "assistant";

function lastUserMessage(messages: Message[]): UserMessage | undefined {
  return [...messages].reverse().find(isUser);
}

function latestMessageHasImage(messages: Message[]): boolean {
  const latest = messages.at(-1);
  return (
    latest !== undefined &&
    isUser(latest) &&
    userImageUrl(latest.content) !== undefined
  );
}

/**
 * Conversation history as plain chat messages for the local model. Tool
 * traffic is skipped; attached images are replaced with a marker so the text
 * history stays small.
 */
function toChatHistory(messages: Message[], limit: number) {
  const history: { role: "user" | "assistant"; content: string }[] = [];

  for (const message of messages) {
    if (isUser(message)) {
      const marker = userImageUrl(message.content) ? "\n[user attached a food photo]" : "";
      const text = `${userText(message.content)}${marker}`.trim();
      if (text) history.push({ role: "user", content: text });
    } else if (isAssistant(message) && message.content?.trim()) {
      history.push({ role: "assistant", content: message.content });
    }
  }

  return history.slice(-limit);
}

function historyDigest(messages: Message[], limit: number): string {
  return toChatHistory(messages, limit)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
}

/**
 * Trusted Angular store state forwarded by the frontend via
 * connectAgentContext. This is what lets the model answer questions about
 * logged meals, goals, and remaining macros.
 */
function contextBlock(context: Context[]): string {
  const lines = context
    .filter((entry) => entry.value.trim())
    .map((entry) => `- ${entry.description || "context"}: ${entry.value}`);

  return lines.length > 0 ? `Trusted app state:\n${lines.join("\n")}` : "";
}

/**
 * The tool whose result ended the previous run, when the current run is a
 * tool-result continuation (last message has role "tool"). The runtime
 * re-invokes the agent after every frontend tool result; without this check
 * those continuation runs were misrouted into a fresh meal analysis.
 */
function trailingToolResult(messages: Message[]): { toolName: string } | undefined {
  const last = messages.at(-1);
  if (!last || last.role !== "tool") return undefined;

  const toolCallId = (last as ToolMessage).toolCallId;
  const call = messages
    .filter(isAssistant)
    .flatMap((message) => message.toolCalls ?? [])
    .find((toolCall) => toolCall.id === toolCallId);

  return { toolName: call?.function.name ?? "" };
}

/** The a2uiAction the Angular surface forwards when an apply button is pressed. */
function getApplyMealDraftAction(forwardedProps: unknown) {
  const action = a2uiApplyActionSchema.safeParse(
    (forwardedProps as Record<string, unknown> | undefined)?.a2uiAction,
  );
  if (!action.success || action.data.userAction.name !== "applyMealDraft") {
    return undefined;
  }

  const { surfaceId = "macroquest-meal-analysis", sourceComponentId = "", timestamp = "" } =
    action.data.userAction;
  return { surfaceId, actionKey: `${surfaceId}:${sourceComponentId}:${timestamp}` };
}

// ---------------------------------------------------------------------------
// Local model client
// ---------------------------------------------------------------------------

/**
 * One JSON completion against llama.cpp. The response_format grammar
 * guarantees the shape at generation time; the zod parser is the single
 * runtime gate that turns the raw JSON into a typed value.
 */
async function completeJson<T>(options: {
  prompt: string;
  imageUrl?: string;
  responseFormat: unknown;
  parser: z.ZodType<T>;
  maxTokens: number;
  temperature: number;
  abortSignal: AbortSignal;
}): Promise<T> {
  const content: Record<string, unknown>[] = [{ type: "text", text: options.prompt }];
  if (options.imageUrl) {
    content.push({ type: "image_url", image_url: { url: options.imageUrl } });
  }

  const response = await fetch(completionUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${modelApiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: "user", content }],
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      response_format: options.responseFormat,
    }),
    signal: options.abortSignal,
  });

  if (!response.ok) {
    throw new Error(`Local model request failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  const raw: string = payload.choices?.[0]?.message?.content ?? "";
  return options.parser.parse(JSON.parse(raw));
}

async function* streamChatWithLocalGemma(
  messages: Message[],
  context: Context[],
  abortSignal: AbortSignal,
): AsyncGenerator<string> {
  const response = await fetch(completionUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${modelApiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: "system", content: buildChatSystemPrompt(contextBlock(context)) },
        ...toChatHistory(messages, 12),
      ],
      max_tokens: Math.min(maxOutputTokens, 768),
      temperature: 0.4,
      stream: true,
    }),
    signal: abortSignal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`Local model request failed: ${response.status} ${await response.text()}`);
  }

  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;

      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          yield delta;
        }
      } catch {
        // partial line; ignore
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Intent routing
// ---------------------------------------------------------------------------

function isMacroSwapLabRequest(prompt: string) {
  return /\b(lighter|lighten|swap|lower calorie|less calories|cut calories|macro lab|macro simulator|what if)\b/i.test(
    prompt,
  );
}

function fallbackIntent(prompt: string): Intent {
  if (isMacroSwapLabRequest(prompt)) return "macro_swap_lab";
  if (/\b(chart|graph|visuali[sz]e|plot|progress bars?)\b/i.test(prompt)) return "macro_chart";
  if (/\bgoals?\b/i.test(prompt) && /\d/.test(prompt)) return "set_goals";
  if (/\b(ate|eat|meal|breakfast|lunch|dinner|snack|analy[sz]e|track|log|macros? (of|for)|bowl|sandwich|salad)\b/i.test(prompt)) {
    return "analyze_meal";
  }
  return "chat";
}

async function classifyIntent(messages: Message[], abortSignal: AbortSignal): Promise<Intent> {
  const prompt = userText(lastUserMessage(messages)?.content ?? "");

  try {
    const result = await completeJson({
      prompt: buildIntentClassificationPrompt(historyDigest(messages, 6), prompt),
      responseFormat: intentResponseFormat,
      parser: intentResultSchema,
      maxTokens: 48,
      temperature: 0,
      abortSignal,
    });
    return result.intent;
  } catch {
    return fallbackIntent(prompt);
  }
}

// ---------------------------------------------------------------------------
// Meal draft + generated A2UI surface
// ---------------------------------------------------------------------------

/** Business rounding/clamping; the item shape itself is grammar-guaranteed. */
function roundItem(item: MealItem, index: number): LoggedItem {
  return {
    id: `gemma-${index + 1}`,
    name: item.name.trim() || `Visible food ${index + 1}`,
    servingLabel: item.servingLabel.trim() || "estimated serving",
    servings: Math.max(0.1, item.servings),
    calories: Math.max(0, Math.round(item.calories)),
    protein: Math.max(0, Math.round(item.protein)),
    carbs: Math.max(0, Math.round(item.carbs)),
    fat: Math.max(0, Math.round(item.fat)),
    confidence: Math.min(1, Math.max(0, item.confidence)),
  };
}

function draftFromModelResponse(response: MealUIResponse): MealDraft {
  const { title, source, notes, items } = response.mealDraft;
  return {
    title: title.trim() || "Local Gemma meal scan",
    source: source.trim() || "Gemma 4 via local llama.cpp vision",
    notes: notes.trim() || "Local Gemma generated this meal estimate.",
    items: items.map(roundItem),
  };
}

function totalsForDraft(draft: MealDraft) {
  return draft.items.reduce(
    (totals, item) => ({
      calories: totals.calories + item.calories,
      protein: totals.protein + item.protein,
      carbs: totals.carbs + item.carbs,
      fat: totals.fat + item.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

/**
 * Nothing on the surface is server-authored. Instead of overwriting texts,
 * verify that the model's own surface visibly shows the totals implied by its
 * meal draft — a mismatch becomes retry feedback, so what the apply button
 * logs always agrees with what the user saw.
 */
function verifyA2UIMatchesDraft(a2ui: A2UISurface, draft: MealDraft): string[] {
  const totals = totalsForDraft(draft);
  const visibleText = a2ui.components
    .filter((component) => component.component === "Text")
    .map((component) => component.text ?? "")
    .join(" ");

  const errors: string[] = [];
  for (const [label, value] of Object.entries(totals)) {
    if (!new RegExp(`(?<!\\d)${value}(?!\\d)`).test(visibleText)) {
      errors.push(
        `the surface must visibly show the total ${label} value ${value} (the sum of your mealDraft items).`,
      );
    }
  }

  return errors;
}

const a2uiComponentTypeNames = new Set(["Button", "Card", "Column", "Divider", "Row", "Text"]);

/**
 * Semantic validation the grammar cannot express: ids are unique and resolve,
 * a root exists, and exactly the apply interaction the store handler expects
 * is present. Component shapes (required text/children/action) are already
 * grammar-guaranteed by modelGeneratedMealUIResponseFormat.
 */
function validateA2UISemantics(a2ui: A2UISurface): void {
  const errors: string[] = [];
  const byId = new Map(a2ui.components.map((component) => [component.id, component]));

  if (!a2ui.surfaceId.trim()) {
    errors.push("a2ui.surfaceId must be a non-empty string.");
  }
  if (byId.size !== a2ui.components.length) {
    errors.push("component ids must be unique.");
  }
  if (!byId.has("root")) {
    errors.push('a2ui.components must include a component with id "root".');
  }

  for (const component of a2ui.components) {
    if (a2uiComponentTypeNames.has(component.id)) {
      errors.push(`component id "${component.id}" must not be a component type name.`);
    }

    for (const ref of [component.child, ...(component.children ?? [])]) {
      if (ref === undefined) continue;
      if (ref === component.id) {
        errors.push(`component "${component.id}" references itself as a child.`);
      } else if (!byId.has(ref)) {
        errors.push(`component "${component.id}" references missing child "${ref}".`);
      }
    }
  }

  const applyButtons = a2ui.components.filter(
    (component) =>
      component.component === "Button" && component.action?.event.name === "applyMealDraft",
  );
  if (applyButtons.length === 0) {
    errors.push(
      'a2ui.components must include one Button whose action is {"event":{"name":"applyMealDraft","context":{...}}}.',
    );
  }
  for (const button of applyButtons) {
    const labelText = byId.get(button.child ?? "")?.text ?? "";
    if (!/apply|log|add|track/i.test(labelText)) {
      errors.push(
        `apply Button "${button.id}" needs a child Text label that describes applying the macros (e.g. "Apply found macros").`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
}

async function generateMealUIWithLocalGemma(
  messages: Message[],
  context: Context[],
  abortSignal: AbortSignal,
): Promise<{ draft: MealDraft; a2ui: A2UISurface }> {
  const latest = lastUserMessage(messages);
  const prompt = userText(latest?.content ?? "");
  const imageUrl = latest ? userImageUrl(latest.content) : undefined;
  const history = historyDigest(messages.slice(0, -1), 6);

  let validationFeedback: string | undefined;

  // One retry with the validator's feedback: a 12B model corrects a rejected
  // tree far more reliably than it produces a perfect one first try.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const generated = await completeJson({
      prompt: buildMealUIPrompt(prompt, history, contextBlock(context), validationFeedback),
      imageUrl,
      responseFormat: modelGeneratedMealUIResponseFormat,
      parser: mealUIResponseSchema,
      maxTokens: Math.min(maxOutputTokens, 3000),
      temperature: 0.15,
      abortSignal,
    });

    const draft = draftFromModelResponse(generated);
    try {
      validateA2UISemantics(generated.a2ui);
      // Totals drift (rounding, servings math) earns one retry with feedback —
      // but only for text turns. On the second attempt (or any vision turn,
      // where re-encoding the image doubles an already slow call and the
      // estimates are fuzzy anyway) a semantically valid surface is accepted:
      // surface and draft come from the same response, and a retry regenerates
      // both, so the target would keep moving anyway.
      const totalsErrors = verifyA2UIMatchesDraft(generated.a2ui, draft);
      if (totalsErrors.length > 0 && attempt === 0 && !imageUrl) {
        throw new Error(totalsErrors.join(" "));
      }
      return { draft, a2ui: generated.a2ui };
    } catch (error) {
      validationFeedback = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(`Model A2UI failed validation twice: ${validationFeedback}`);
}

// ---------------------------------------------------------------------------
// Open Generative UI sandbox widgets (Macro Swap Lab, Macro chart)
// ---------------------------------------------------------------------------

/**
 * A blank sandbox is worse than no sandbox: if the generated JS has a syntax
 * error the websandbox iframe fails silently and renders 0px tall. These are
 * the failure modes every widget shares (broken JS, ${...} placeholders that
 * nothing interpolates, bad height); each widget adds its own checks on top.
 */
function sandboxWidgetBaseErrors(widget: SandboxWidget): string[] {
  const errors: string[] = [];

  if (widget.initialHeight < 220 || widget.initialHeight > 600) {
    errors.push("initialHeight must be a number between 220 and 600.");
  }
  if (widget.html.includes("${") || widget.css.includes("${")) {
    errors.push(
      "html/css must contain literal values only — ${...} template placeholders are never interpolated. Compute the numbers yourself and write them as plain text.",
    );
  }

  for (const [label, source] of [
    ["jsFunctions", widget.jsFunctions],
    ...widget.jsExpressions.map((expression, i): [string, string] => [`jsExpressions[${i}]`, expression]),
  ] as [string, string][]) {
    try {
      new Function(source);
    } catch (error) {
      errors.push(
        `${label} is not valid JavaScript: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return errors;
}

function validateMacroSwapLab(widget: SandboxWidget): void {
  const errors = sandboxWidgetBaseErrors(widget);

  if (!/<button/i.test(widget.html)) {
    errors.push("html must contain a <button> element.");
  }
  if (!/applySwap|apply-lighter-swap/.test(widget.html)) {
    errors.push('the apply button needs id "applySwap" and data-testid "apply-lighter-swap".');
  }
  if (!/swapStatus/.test(widget.html)) {
    errors.push('html must contain a status element with id "swapStatus".');
  }
  if (!/applyMacroSwap/.test(widget.jsFunctions + widget.jsExpressions.join("\n"))) {
    errors.push("the JavaScript must call Websandbox.connection.remote.applyMacroSwap.");
  }

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
}

function validateMacroChart(widget: SandboxWidget): void {
  const errors = sandboxWidgetBaseErrors(widget);

  if (!/<svg/i.test(widget.html)) {
    errors.push("html must contain an inline <svg> chart.");
  }
  if (!/macro-chart/.test(widget.html)) {
    errors.push('the root element needs data-testid "macro-chart".');
  }

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
}

/** Generates a sandbox widget with one validation-feedback retry. */
async function generateSandboxWidget(
  messages: Message[],
  context: Context[],
  abortSignal: AbortSignal,
  options: {
    buildPrompt: (prompt: string, context: string, validationFeedback?: string) => string;
    validate: (widget: SandboxWidget) => void;
  },
): Promise<SandboxWidget> {
  const prompt = userText(lastUserMessage(messages)?.content ?? "");

  let validationFeedback: string | undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const widget = await completeJson({
      prompt: options.buildPrompt(prompt, contextBlock(context), validationFeedback),
      responseFormat: sandboxWidgetResponseFormat,
      parser: sandboxWidgetSchema,
      maxTokens: Math.min(maxOutputTokens, 2048),
      temperature: 0.15,
      abortSignal,
    });

    try {
      options.validate(widget);
      return widget;
    } catch (error) {
      validationFeedback = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(`Sandbox UI failed validation twice: ${validationFeedback}`);
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

async function extractMacroGoals(
  messages: Message[],
  abortSignal: AbortSignal,
): Promise<MacroGoals> {
  const goals = await completeJson({
    prompt: buildGoalsExtractionPrompt(userText(lastUserMessage(messages)?.content ?? "")),
    responseFormat: macroGoalsResponseFormat,
    parser: macroGoalsSchema,
    maxTokens: 64,
    temperature: 0,
    abortSignal,
  });

  return Object.fromEntries(
    Object.entries(goals)
      .filter(([, value]) => value !== undefined && value > 0)
      .map(([key, value]) => [key, Math.round(value!)]),
  );
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

function textChunk(messageId: string, delta: string) {
  return {
    type: "TEXT_MESSAGE_CHUNK",
    role: "assistant",
    messageId,
    delta,
  } as any;
}

function* toolCallEvents(parentMessageId: string, toolCallName: string, args: unknown) {
  const toolCallId = randomUUID();
  yield {
    type: "TOOL_CALL_START",
    parentMessageId,
    toolCallId,
    toolCallName,
  } as any;
  yield {
    type: "TOOL_CALL_ARGS",
    toolCallId,
    delta: JSON.stringify(args),
  } as any;
  yield {
    type: "TOOL_CALL_END",
    toolCallId,
  } as any;
}

const agent = new BuiltInAgent({
  type: "custom",
  factory: async ({ input, abortSignal }) =>
    (async function* () {
      const messages = input.messages as Message[];
      const context = (input.context ?? []) as Context[];

      const applyAction = getApplyMealDraftAction(input.forwardedProps);
      if (applyAction) {
        if (appliedMealDraftActionKeys.has(applyAction.actionKey)) {
          return;
        }

        const messageId = randomUUID();
        const draft = pendingMealDraftsBySurface.get(applyAction.surfaceId);

        if (!draft) {
          yield textChunk(messageId, assistantCopy.missingPendingDraft);
          return;
        }

        yield textChunk(messageId, assistantCopy.applyingMacros);
        yield* toolCallEvents(messageId, "logMealDraft", draft);

        pendingMealDraftsBySurface.delete(applyAction.surfaceId);
        appliedMealDraftActionKeys.add(applyAction.actionKey);
        return;
      }

      // Tool-result continuation runs must not start a new generation.
      const toolResult = trailingToolResult(messages);
      if (toolResult) {
        if (toolResult.toolName === "logMealDraft") {
          const messageId = randomUUID();
          yield textChunk(messageId, assistantCopy.mealLogged);
        }
        // Other tool results (setMacroGoals, generateSandboxedUi) need no
        // follow-up message; their UI already reflects the change.
        return;
      }

      const intent = latestMessageHasImage(messages)
        ? "analyze_meal"
        : await classifyIntent(messages, abortSignal);

      if (intent === "macro_swap_lab") {
        const messageId = randomUUID();
        yield textChunk(messageId, assistantCopy.generatingSwapLab);

        let labArgs;
        try {
          labArgs = await generateSandboxWidget(messages, context, abortSignal, {
            buildPrompt: buildMacroSwapLabPrompt,
            validate: validateMacroSwapLab,
          });
        } catch (error) {
          yield textChunk(messageId, assistantCopy.swapLabFailed);
          return;
        }

        yield textChunk(messageId, assistantCopy.swapLabReady);
        yield* toolCallEvents(messageId, "generateSandboxedUi", labArgs);
        return;
      }

      if (intent === "macro_chart") {
        const messageId = randomUUID();
        yield textChunk(messageId, assistantCopy.drawingChart);

        let chartArgs;
        try {
          chartArgs = await generateSandboxWidget(messages, context, abortSignal, {
            buildPrompt: buildMacroChartPrompt,
            validate: validateMacroChart,
          });
        } catch (error) {
          yield textChunk(messageId, assistantCopy.chartFailed);
          return;
        }

        yield* toolCallEvents(messageId, "generateSandboxedUi", chartArgs);
        return;
      }

      if (intent === "set_goals") {
        const messageId = randomUUID();

        let goals: MacroGoals = {};
        try {
          goals = await extractMacroGoals(messages, abortSignal);
        } catch {
          // fall through to the empty-goals reply below
        }

        const entries = Object.entries(goals);
        if (entries.length === 0) {
          yield textChunk(messageId, assistantCopy.askForGoals);
          return;
        }

        const summary = entries
          .map(([key, value]) => `${key} ${value}${key === "calories" ? " kcal" : "g"}`)
          .join(", ");
        yield textChunk(messageId, assistantCopy.settingGoals(summary));
        yield* toolCallEvents(messageId, "setMacroGoals", goals);
        return;
      }

      if (intent === "chat") {
        const messageId = randomUUID();
        try {
          for await (const delta of streamChatWithLocalGemma(messages, context, abortSignal)) {
            yield textChunk(messageId, delta);
          }
        } catch (error) {
          yield textChunk(messageId, assistantCopy.modelUnreachable);
        }
        return;
      }

      // intent === "analyze_meal"
      const hasImage = latestMessageHasImage(messages);
      const messageId = randomUUID();
      yield textChunk(
        messageId,
        hasImage ? assistantCopy.scanningImage : assistantCopy.estimatingFromText,
      );

      let generated;
      try {
        generated = await generateMealUIWithLocalGemma(messages, context, abortSignal);
      } catch (error) {
        yield textChunk(messageId, assistantCopy.mealEstimateFailed);
        return;
      }
      const { draft, a2ui } = generated;
      pendingMealDraftsBySurface.set(a2ui.surfaceId, draft);

      yield textChunk(
        messageId,
        assistantCopy.mealSurfaceReady(draft.items.map((item) => item.name).join(", ")),
      );
      yield* toolCallEvents(messageId, macroQuestA2UIToolName, a2ui);
    })(),
});

const runtime = new CopilotRuntime({
  agents: { default: agent },
  runner: new InMemoryAgentRunner(),
  a2ui: {
    injectA2UITool: macroQuestA2UIToolName,
    a2uiToolNames: [macroQuestA2UIToolName],
    defaultCatalogId: basicA2UICatalogId,
  },
  openGenerativeUI: true,
});

const app = new Hono();

app.use(
  "*",
  cors({
    origin: [
      "http://127.0.0.1:4300",
      "http://localhost:4300",
      "http://127.0.0.1:4301",
      "http://localhost:4301",
      "http://127.0.0.1:4200",
      "http://localhost:4200",
    ],
    allowMethods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "x-copilotcloud-public-api-key",
    ],
    exposeHeaders: ["Content-Type"],
    credentials: true,
    maxAge: 86400,
  }),
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    runtime: "macroquest",
    modelBaseUrl,
    modelName,
  }),
);

app.route(
  "/",
  createCopilotEndpoint({
    runtime,
    basePath: "/api/copilotkit",
  }),
);

const server = serve({ fetch: app.fetch, port });
server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${port} is already in use. Stop the existing process or set PORT to another value.`,
    );
    process.exit(1);
  }

  throw error;
});

console.log(
  `MacroQuest runtime listening at http://127.0.0.1:${port}/api/copilotkit`,
);
console.log(`Local model endpoint: ${modelBaseUrl}`);
console.log(`Local model name: ${modelName}`);
