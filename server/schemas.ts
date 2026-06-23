/**
 * Model I/O contracts, in two matched halves:
 *
 * 1. llama.cpp `response_format` JSON schemas — compiled into grammars, so
 *    anything required here is structurally guaranteed at generation time.
 * 2. zod parsers mirroring those grammars — applied once at the client
 *    boundary so the rest of the server works with typed values and never
 *    re-checks shapes by hand.
 *
 * Semantic rules the grammar cannot express (ids resolve, totals match,
 * generated JS parses) live next to the generators in index.ts.
 */
import { z } from "zod";

export const modelGeneratedMealUIResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "macroquest_model_generated_meal_ui",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["mealDraft", "a2ui"],
      properties: {
        mealDraft: {
          type: "object",
          additionalProperties: false,
          required: ["title", "source", "notes", "items"],
          properties: {
            title: { type: "string" },
            source: { type: "string" },
            notes: { type: "string" },
            items: {
              type: "array",
              minItems: 1,
              maxItems: 6,
              items: {
                type: "object",
                additionalProperties: false,
                required: [
                  "name",
                  "servingLabel",
                  "servings",
                  "calories",
                  "protein",
                  "carbs",
                  "fat",
                  "confidence",
                ],
                properties: {
                  name: { type: "string" },
                  servingLabel: { type: "string" },
                  servings: { type: "number" },
                  calories: { type: "number" },
                  protein: { type: "number" },
                  carbs: { type: "number" },
                  fat: { type: "number" },
                  confidence: { type: "number" },
                },
              },
            },
          },
        },
        a2ui: {
          type: "object",
          additionalProperties: false,
          required: ["surfaceId", "components", "data"],
          properties: {
            surfaceId: { type: "string" },
            components: {
              type: "array",
              minItems: 4,
              // A 6-item meal with per-item rows needs ~33 components; a cap
              // that is too tight makes the grammar drop definitions that are
              // still referenced, which fails structural validation.
              maxItems: 40,
              // Per-component-type variants: llama.cpp turns this schema into
              // a grammar, so requiring `text` on Text and `children` on
              // Row/Column here prevents the 12B model from ever emitting the
              // invalid trees the validator would otherwise reject.
              items: {
                anyOf: [
                  {
                    type: "object",
                    additionalProperties: false,
                    required: ["id", "component", "text"],
                    properties: {
                      id: { type: "string" },
                      component: { const: "Text" },
                      text: { type: "string", minLength: 1 },
                      variant: {
                        type: "string",
                        enum: ["h1", "h2", "h3", "h4", "h5", "caption", "body"],
                      },
                    },
                  },
                  {
                    type: "object",
                    additionalProperties: false,
                    required: ["id", "component", "children"],
                    properties: {
                      id: { type: "string" },
                      component: { const: "Row" },
                      children: {
                        type: "array",
                        minItems: 1,
                        // Rows render on a ~380px chat panel; more than 4
                        // children overflow, so the grammar forbids it.
                        maxItems: 4,
                        items: { type: "string" },
                      },
                      align: {
                        type: "string",
                        enum: ["start", "center", "end", "stretch"],
                      },
                      justify: {
                        type: "string",
                        enum: [
                          "start",
                          "center",
                          "end",
                          "spaceBetween",
                          "spaceAround",
                          "spaceEvenly",
                        ],
                      },
                    },
                  },
                  {
                    type: "object",
                    additionalProperties: false,
                    required: ["id", "component", "children"],
                    properties: {
                      id: { type: "string" },
                      component: { const: "Column" },
                      children: {
                        type: "array",
                        minItems: 1,
                        items: { type: "string" },
                      },
                      align: {
                        type: "string",
                        enum: ["start", "center", "end", "stretch"],
                      },
                      justify: {
                        type: "string",
                        enum: [
                          "start",
                          "center",
                          "end",
                          "spaceBetween",
                          "spaceAround",
                          "spaceEvenly",
                        ],
                      },
                    },
                  },
                  {
                    type: "object",
                    additionalProperties: false,
                    required: ["id", "component", "child"],
                    properties: {
                      id: { type: "string" },
                      component: { const: "Card" },
                      child: { type: "string" },
                    },
                  },
                  {
                    type: "object",
                    additionalProperties: false,
                    required: ["id", "component", "child", "action"],
                    properties: {
                      id: { type: "string" },
                      component: { const: "Button" },
                      child: { type: "string" },
                      variant: {
                        type: "string",
                        enum: ["primary", "borderless"],
                      },
                      action: {
                        type: "object",
                        additionalProperties: false,
                        required: ["event"],
                        properties: {
                          event: {
                            type: "object",
                            additionalProperties: false,
                            required: ["name"],
                            properties: {
                              name: { const: "applyMealDraft" },
                              context: {
                                type: "object",
                                additionalProperties: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  {
                    type: "object",
                    additionalProperties: false,
                    required: ["id", "component"],
                    properties: {
                      id: { type: "string" },
                      component: { const: "Divider" },
                      axis: {
                        type: "string",
                        enum: ["horizontal", "vertical"],
                      },
                    },
                  },
                ],
              },
            },
            data: {
              type: "object",
              additionalProperties: true,
            },
          },
        },
      },
    },
  },
} as const;

export const intentResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "macroquest_intent",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["intent"],
      properties: {
        intent: {
          type: "string",
          enum: ["analyze_meal", "macro_swap_lab", "macro_chart", "set_goals", "chat"],
        },
      },
    },
  },
} as const;

// Shared by every Open Generative UI widget (swap lab, macro chart).
export const sandboxWidgetResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "macroquest_sandbox_widget",
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "initialHeight",
        "placeholderMessages",
        "css",
        "html",
        "jsFunctions",
        "jsExpressions",
      ],
      properties: {
        initialHeight: { type: "number" },
        placeholderMessages: { type: "array", items: { type: "string" } },
        css: { type: "string" },
        html: { type: "string" },
        jsFunctions: { type: "string" },
        jsExpressions: { type: "array", items: { type: "string" } },
      },
    },
  },
};

export const macroGoalsResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "macroquest_goals",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        calories: { type: "number" },
        protein: { type: "number" },
        carbs: { type: "number" },
        fat: { type: "number" },
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Zod parsers — one typed gate at the model-client boundary. These mirror the
// grammars above; downstream code receives inferred types instead of unknown.
// ---------------------------------------------------------------------------

export const mealItemSchema = z.object({
  name: z.string(),
  servingLabel: z.string(),
  servings: z.number(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  confidence: z.number(),
});
export type MealItem = z.infer<typeof mealItemSchema>;

export const a2uiComponentSchema = z
  .object({
    id: z.string(),
    component: z.string(),
    child: z.string().optional(),
    children: z.array(z.string()).optional(),
    text: z.string().optional(),
    variant: z.string().optional(),
    action: z
      .object({
        event: z.object({
          name: z.string(),
          context: z.record(z.string(), z.unknown()).optional(),
        }),
      })
      .optional(),
  })
  .passthrough();
export type A2UIComponent = z.infer<typeof a2uiComponentSchema>;

export const mealUIResponseSchema = z.object({
  mealDraft: z.object({
    title: z.string(),
    source: z.string(),
    notes: z.string(),
    items: z.array(mealItemSchema).min(1),
  }),
  a2ui: z.object({
    surfaceId: z.string(),
    components: z.array(a2uiComponentSchema).min(1),
    data: z.record(z.string(), z.unknown()),
  }),
});
export type MealUIResponse = z.infer<typeof mealUIResponseSchema>;
export type A2UISurface = MealUIResponse["a2ui"];

export const sandboxWidgetSchema = z.object({
  initialHeight: z.number(),
  placeholderMessages: z.array(z.string()),
  css: z.string(),
  html: z.string(),
  jsFunctions: z.string(),
  jsExpressions: z.array(z.string()),
});
export type SandboxWidget = z.infer<typeof sandboxWidgetSchema>;

export const intentResultSchema = z.object({
  intent: z.enum(["analyze_meal", "macro_swap_lab", "macro_chart", "set_goals", "chat"]),
});
export type Intent = z.infer<typeof intentResultSchema>["intent"];

export const macroGoalsSchema = z.object({
  calories: z.number().optional(),
  protein: z.number().optional(),
  carbs: z.number().optional(),
  fat: z.number().optional(),
});
export type MacroGoals = z.infer<typeof macroGoalsSchema>;

/** Shape of the a2uiAction the Angular surface forwards on button presses. */
export const a2uiApplyActionSchema = z.object({
  userAction: z.object({
    name: z.string(),
    surfaceId: z.string().optional(),
    sourceComponentId: z.string().optional(),
    timestamp: z.string().optional(),
  }),
});
