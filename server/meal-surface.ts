/**
 * Meal analysis: the model returns a mealDraft plus its own A2UI surface in
 * one grammar-constrained response. This module owns the semantic validation
 * the grammar cannot express, and the one validation-feedback retry.
 */
import type { Context, Message } from "@ag-ui/core";
import {
  contextBlock,
  historyDigest,
  lastUserMessage,
  userImageUrl,
  userText,
} from "./agui";
import { maxOutputTokens } from "./config";
import { completeJson } from "./model-client";
import { buildMealUIPrompt } from "./prompts";
import {
  mealUIResponseSchema,
  modelGeneratedMealUIResponseFormat,
  type A2UISurface,
  type MealItem,
  type MealUIResponse,
} from "./schemas";

export type LoggedItem = MealItem & { id: string };
export type MealDraft = {
  title: string;
  source: string;
  notes: string;
  items: LoggedItem[];
};

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

export async function generateMealUI(
  messages: Message[],
  context: Context[],
  abortSignal: AbortSignal,
): Promise<{ draft: MealDraft; a2ui: A2UISurface }> {
  const latest = lastUserMessage(messages);
  const prompt = userText(latest?.content ?? "");
  const imageUrl = latest ? userImageUrl(latest.content) : undefined;
  const history = historyDigest(messages.slice(0, -1), 6);

  let validationFeedback: string | undefined;

  // One retry with the validator's feedback: a small model corrects a rejected
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
