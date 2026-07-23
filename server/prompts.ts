/**
 * All model prompts for the MacroQuest runtime in one place.
 *
 * The runtime (index.ts) imports only builder functions from here — no logic,
 * no schemas, just prompt text. Sections mirror the agent's intent routing:
 *
 *   1. Persona            — shared preamble for every prompt
 *   2. Intent             — classify the latest user message
 *   3. Meal analysis      — mealDraft JSON + model-authored A2UI surface
 *   4. Macro Swap Lab     — Open Generative UI sandbox widget (interactive)
 *   5. Macro chart        — Open Generative UI sandbox widget (inline SVG)
 *   6. Goals              — extract daily macro goals
 *   7. Chat               — plain conversational system prompt
 *   8. Assistant copy     — status/error lines the agent streams verbatim
 */

// ---------------------------------------------------------------------------
// 1. Persona
// ---------------------------------------------------------------------------

/** Base persona shared by every prompt. */
export const macroQuestPersona = `
You are MacroQuest, a food tracking copilot for an Angular demo app.

Users speak naturally. They do not know tool names, A2UI protocol names, or
state-management details. Infer intent from plain requests such as "log this",
"track this meal", "what are the macros?", or an attached food photo.

Use concise text. Let tools and UI do most of the work.

Nutrition values are estimates. Do not present medical advice.
`.trim();

/** Retry suffix appended when a previous generation failed validation. */
function rejectedFeedback(validationFeedback?: string): string {
  return validationFeedback
    ? `Your previous attempt was rejected. Fix these problems and return the full corrected JSON:\n${validationFeedback}`
    : '';
}

// ---------------------------------------------------------------------------
// 2. Intent classification
// ---------------------------------------------------------------------------

/** Classifies the latest user message into one of the agent's four intents. */
export function buildIntentClassificationPrompt(history: string, latestPrompt: string): string {
  return [
    "Classify the user's LATEST request for a food tracking app. Return JSON only.",
    'Intents:',
    '- "analyze_meal": user describes food they ate / want tracked or estimated, or attached a food photo.',
    '- "macro_swap_lab": user wants a lighter/lower-calorie version of the current meal, a swap, or an interactive what-if simulator.',
    '- "macro_chart": user wants a chart, graph, or visualization of their macros, intake, or progress against goals.',
    '- "set_goals": user wants to change daily calorie/protein/carb/fat goals.',
    '- "chat": everything else (questions about logged meals or remaining macros, greetings, general nutrition questions).',
    history ? `Conversation:\n${history}` : '',
    `Latest user message: ${latestPrompt}`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ---------------------------------------------------------------------------
// 3. Meal analysis + model-authored A2UI surface
// ---------------------------------------------------------------------------

/**
 * Example response shown to the model. Kept as a real object so it is
 * readable here and guaranteed-valid JSON in the prompt.
 */
const mealUIExample = {
  mealDraft: {
    title: 'Grilled chicken bowl',
    source: 'Gemma 4 via local llama.cpp vision',
    notes: 'one sentence',
    items: [
      {
        name: 'grilled chicken',
        servingLabel: '1 breast',
        servings: 1,
        calories: 280,
        protein: 52,
        carbs: 0,
        fat: 6,
        confidence: 0.8,
      },
    ],
  },
  a2ui: {
    surfaceId: 'macroquest-meal-grilled-chicken-bowl',
    components: [
      { id: 'root', component: 'Card', child: 'layout' },
      {
        id: 'layout',
        component: 'Column',
        children: [
          'title',
          'item_row_1',
          'divider',
          'totals_row_1',
          'totals_row_2',
          'summary',
          'apply_button',
          'footer',
        ],
      },
      { id: 'title', component: 'Text', text: 'Grilled chicken bowl', variant: 'h2' },
      {
        id: 'item_row_1',
        component: 'Row',
        justify: 'spaceBetween',
        children: ['item_name_1', 'item_kcal_1'],
      },
      { id: 'item_name_1', component: 'Text', text: 'Grilled chicken (1 breast)' },
      { id: 'item_kcal_1', component: 'Text', text: '280 kcal' },
      { id: 'divider', component: 'Divider' },
      { id: 'totals_row_1', component: 'Row', children: ['calories_text', 'protein_text'] },
      { id: 'totals_row_2', component: 'Row', children: ['carbs_text', 'fat_text'] },
      { id: 'calories_text', component: 'Text', text: 'Calories: 280' },
      { id: 'protein_text', component: 'Text', text: 'Protein: 52g' },
      { id: 'carbs_text', component: 'Text', text: 'Carbs: 0g' },
      { id: 'fat_text', component: 'Text', text: 'Fat: 6g' },
      { id: 'summary', component: 'Text', text: 'Apply these macros to the MacroQuest dashboard?' },
      {
        id: 'apply_button',
        component: 'Button',
        child: 'apply_label',
        variant: 'primary',
        action: { event: { name: 'applyMealDraft', context: { source: 'a2ui-review' } } },
      },
      { id: 'apply_label', component: 'Text', text: 'Apply found macros' },
      { id: 'footer', component: 'Text', text: 'Generated by local Gemma 4', variant: 'caption' },
    ],
    data: {},
  },
};

/**
 * Meal analysis: mealDraft JSON plus a model-authored A2UI surface.
 * The response format schema (in index.ts) enforces per-component structure;
 * this prompt covers layout guidance and the trusted/required pieces.
 */
export function buildMealUIPrompt(
  prompt: string,
  history: string,
  context: string,
  validationFeedback?: string,
): string {
  return [
    macroQuestPersona,
    context,
    history ? `Recent conversation:\n${history}` : '',
    "Analyze the meal and return JSON only. If a food image is attached, analyze the visible foods; otherwise estimate from the user's text description of what they ate.",
    'The JSON must include BOTH mealDraft and your own a2ui surface.',
    'Meal draft rules: estimate conservatively and prefer distinct food groups (one item per food) over one generic item.',
    '',
    'A2UI surface rules — you design the layout yourself:',
    '- Use only these catalog components: Button, Card, Column, Divider, Row, Text.',
    '- Components are FLAT: `child` / `children` reference other component ids. Never inline component objects.',
    '- Include exactly one component with id "root" (usually a Card whose child is your main Column).',
    '- The surface renders in a chat panel that can be as narrow as 380px. Never put more than 4 short Text components in one Row. Prefer one Row per food item (name left, calories right, justify "spaceBetween").',
    'Required content (the backend verifies all of this and rejects mismatches):',
    '- The meal title as a Text (variant "h2").',
    '- The meal totals visibly shown, e.g. "Calories: 605" — each total MUST equal the exact sum of your mealDraft items. Lay them out as one Row of four, two Rows of two, or a Column — your choice.',
    '- One Button (variant "primary") with action {"event":{"name":"applyMealDraft","context":{"source":"a2ui-review"}}} and a child Text label such as "Apply found macros".',
    '- One short Text asking whether to apply the macros to the MacroQuest dashboard.',
    '- One Text (variant "caption") containing exactly: "Generated by local Gemma 4".',
    'Make the surface informative: a per-item breakdown (each food with its calories), a Divider between the breakdown and the totals, and a caption with serving or confidence notes are all encouraged. Text components use literal text, never bindings. Do not include catalogId.',
    'Use a surfaceId of the form "macroquest-meal-<short-meal-slug>".',
    '',
    "Example shape (adapt the layout, don't copy it verbatim):",
    JSON.stringify(mealUIExample),
    rejectedFeedback(validationFeedback),
    `User request: ${prompt}`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ---------------------------------------------------------------------------
// 4. Macro Swap Lab (Open Generative UI sandbox)
// ---------------------------------------------------------------------------

/**
 * Open Generative UI sandbox (Macro Swap Lab). The markup requirements are
 * stated as literal html contents — a small model otherwise builds DOM from JS,
 * which fails silently in the websandbox iframe when it has a syntax error.
 */
export function buildMacroSwapLabPrompt(prompt: string, context: string): string {
  return [
    macroQuestPersona,
    context,
    "Generate a polished, genuinely interactive 'Macro Swap Lab' sandboxed UI. Return JSON only.",
    'The JSON must have exactly these keys: initialHeight (number), placeholderMessages (string[]), css (string), html (string), jsFunctions (string), jsExpressions (string[]).',
    'PARAMETER ORDER IS CRITICAL: emit initialHeight, placeholderMessages, css, html, jsFunctions, then jsExpressions.',
    'DATA CONTRACT:',
    '- Read selectedMeal and its totals from Trusted app state. Copy the REAL title, calories, protein, carbs, and fat as literal values into the widget. Never display --, unknown, TBD, or invented placeholder data.',
    '- If selectedMeal is null, use the latest meal summary from Trusted app state. Do not perform runtime state lookups from inside the iframe.',
    'HTML CONTRACT — put all markup literally in html; never build the interface from JavaScript:',
    "- Use single quotes for EVERY HTML attribute value (example: data-testid='macro-swap-lab'). The html field is a double-quoted JSON string, so single-quoted attributes avoid broken escaping.",
    "- root <section data-testid='macro-swap-lab'> with data-meal-title, data-base-calories, data-base-protein, data-base-carbs, and data-base-fat attributes containing the literal trusted title and current totals,",
    '- inside that root include an eyebrow, <h3>Macro Swap Lab</h3>, the real meal title, and a short explanation,',
    '- a comparison strip with id="currentCalories" and id="targetCalories", followed by compact Protein, Carbs, and Fat current → target rows,',
    '- four accessible <input type="range"> controls with ids calorieMultiplier, proteinMultiplier, carbsMultiplier, and fatMultiplier plus visible output labels,',
    '- target values with ids targetProtein, targetCarbs, and targetFat; output labels with ids calorieOutput, proteinOutput, carbsOutput, and fatOutput,',
    '- <button id="applySwap" data-testid="apply-lighter-swap">Apply lighter version</button>,',
    '- <div id="swapStatus" role="status" aria-live="polite"></div>.',
    'INTERACTION CONTRACT — you author the complete behavior:',
    '- In BOTH functions start with: const root = document.querySelector(\'[data-testid="macro-swap-lab"]\'); const baseCalories = Number(root.dataset.baseCalories); const baseProtein = Number(root.dataset.baseProtein); const baseCarbs = Number(root.dataset.baseCarbs); const baseFat = Number(root.dataset.baseFat);',
    '- In jsFunctions define globalThis.updateSwapPreview = function () { ... }. Read all four current range values with Number(element.value). Set targetCalories to String(Math.round(baseCalories * calorieMultiplier)); do the identical calculation for protein, carbs, and fat. Update all four output labels to multiplier.toFixed(2) + "x". Never initialize a target from an undefined variable.',
    '- In jsFunctions define globalThis.applyLighterSwap = async function () { ... }. Read the CURRENT slider values and await Websandbox.connection.remote.applyMacroSwap({ title: root.dataset.mealTitle, strategy, notes, baseCalories, baseProtein, baseCarbs, baseFat, calorieMultiplier, proteinMultiplier, carbsMultiplier, fatMultiplier }).',
    '- The base macro values MUST come from the root data attributes and MUST be the unmodified current totals. These let Angular apply a restored sandbox even when its selected-meal pointer was reset.',
    '- While applying: disable the button, set its text to "Applying…", and write "Updating MacroQuest…" to #swapStatus. On result.ok write "Updated MacroQuest: " + result.title. On failure show result.message || result.error || "Could not apply this swap." Always restore the button.',
    '- jsExpressions must contain one self-contained expression that immediately adds input listeners to all four ranges, immediately adds one click listener to applySwap, and calls globalThis.updateSwapPreview() once.',
    '- CopilotKit runs jsExpressions after the iframe DOM already exists. NEVER wait for DOMContentLoaded, load, or any timer; attach listeners directly in the expression.',
    "- Use this direct expression shape: (function () { ['calorieMultiplier','proteinMultiplier','carbsMultiplier','fatMultiplier'].forEach(function (id) { document.getElementById(id).oninput = globalThis.updateSwapPreview; }); document.getElementById('applySwap').onclick = globalThis.applyLighterSwap; globalThis.updateSwapPreview(); })()",
    'DESIGN CONTRACT:',
    '- Make it look like a compact nutrition control panel, not a plain form: clear hierarchy, a pale emerald comparison panel, colored macro accents, aligned values, and generous but efficient spacing.',
    '- Responsive at 380–760px: two columns when space permits, one column on narrow screens. Use system-ui, 12–16px type, 10px radii, accessible focus rings, and no horizontal scrolling.',
    '- initialHeight 480–580. Keep all controls visible without an internal scrollbar.',
    '- css must style hover, focus-visible, disabled, status success/error, range tracks/thumbs, and mobile layout. No gradients or drop shadows.',
    'Sandbox rules: do NOT use localStorage, sessionStorage, cookies, or same-origin fetch. Communicate only through Websandbox.connection.remote.',
    `User request: ${prompt}`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ---------------------------------------------------------------------------
// 5. Macro chart (Open Generative UI sandbox, inline SVG dashboard)
// ---------------------------------------------------------------------------

/**
 * Rich macro dashboard rendered as self-contained, accessible inline SVG.
 * CopilotKit's Open Generative UI guidance prefers inline SVG for charts; it
 * also avoids an external-script race between the iframe and jsExpressions.
 * The model remains the author of every visible element and interaction.
 */
export function buildMacroChartPrompt(prompt: string, context: string): string {
  return [
    macroQuestPersona,
    context,
    "Generate a polished, interactive 'Macro Progress' dashboard as a self-contained sandboxed UI. Return JSON only.",
    'The JSON must have exactly these keys: initialHeight (number), placeholderMessages (string[]), css (string), html (string), jsFunctions (string), jsExpressions (string[]).',
    'PARAMETER ORDER IS CRITICAL: emit initialHeight, placeholderMessages, css, html, jsFunctions, then jsExpressions.',
    'DATA CONTRACT:',
    '- Read dailyTotals, goals, remaining, and meals from Trusted app state. Copy the REAL numbers and meal titles into html as literals. Never use --, unknown, TBD, placeholders, or runtime state lookups.',
    '- Calculate the four percentages yourself. Handle a zero goal safely as 0%. Keep calories in kcal and protein/carbs/fat in grams.',
    'HTML CONTRACT:',
    "- Use single quotes for EVERY HTML and SVG attribute value (example: viewBox='0 0 100 100'). The html field is a double-quoted JSON string, so single-quoted attributes avoid broken escaping.",
    '- Root <section data-testid="macro-chart"> with a compact header, a real-number calorie summary, and a two-button segmented control: data-testid="chart-toggle-percent" and data-testid="chart-toggle-absolute".',
    '- A KPI grid data-testid="macro-kpis" with four cards. Each card shows label, consumed / goal with unit, percentage, and remaining amount.',
    '- Wrap two chart cards in one grid with data-testid="macro-chart-grid". Each card needs a title, one-sentence caption, and a visible legend.',
    '- The first chart is <svg id="goalProgressChart" data-testid="goal-progress-chart" role="img" aria-label="Macro goal progress">. Give it a viewBox, four labeled tracks, and four colored <rect data-macro-bar> bars sized from the real percentages. Add a <text data-macro-value> for every bar with BOTH data-percent-text and data-absolute-text literal attributes.',
    '- The second chart is <svg id="mealContributionChart" data-testid="meal-contribution-chart" role="img" aria-label="Meal calorie contribution">. Render a doughnut using SVG circles with stroke-dasharray/stroke-dashoffset or paths, based on the real meal calorie contributions. Include the real total in its center and a matching HTML legend with meal title and calories.',
    '- Both SVGs must contain visible geometry directly in html. Do not create SVG nodes from JavaScript.',
    'INTERACTION CONTRACT — you author the complete behavior:',
    '- Put the trusted numbers into one literal globalThis.macroChartData object in jsFunctions.',
    '- Define globalThis.setMacroChartMode = function (mode) { ... }. For every [data-macro-value], replace its textContent with data-percent-text in percent mode or data-absolute-text in absolute mode. Update aria-pressed and the active class on both toggle buttons.',
    "- jsExpressions must contain one self-contained expression that immediately adds one click listener to each toggle and calls globalThis.setMacroChartMode('percent') once.",
    '- CopilotKit runs jsExpressions after the iframe DOM already exists. NEVER wait for DOMContentLoaded, load, or any timer; attach listeners directly in the expression.',
    "- Use this direct expression shape: (function () { document.querySelector('[data-testid=\"chart-toggle-percent\"]').onclick = function () { globalThis.setMacroChartMode('percent'); }; document.querySelector('[data-testid=\"chart-toggle-absolute\"]').onclick = function () { globalThis.setMacroChartMode('absolute'); }; globalThis.setMacroChartMode('percent'); })()",
    'DESIGN CONTRACT:',
    '- Present a real dashboard: strong numeric hierarchy, four colored KPI accents, chart-card titles and explanatory captions, accessible legend colors, and an intentional empty/zero state.',
    '- Responsive at 380–760px. KPI cards use 2×2 on narrow screens and four columns when possible. Keep the two chart cards side-by-side at EVERY supported width; never stack them in a media query. This keeps the complete dashboard compact. No horizontal scrolling.',
    '- initialHeight 560–620. Use width:100%, box-sizing:border-box, system-ui, subtle borders, 10px radii, white/slate surfaces, and colors calories #059669, protein #6366f1, carbs #f59e0b, fat #ec4899. No gradients or drop shadows.',
    '- Give each SVG an explicit width:100% and height:180px in CSS. Use vector-effect="non-scaling-stroke" where helpful.',
    'placeholderMessages: one or two concise progress lines such as "Crunching today’s macros…".',
    'Sandbox rules: do NOT load external scripts, images, styles, or fonts. Do NOT use canvas, localStorage, sessionStorage, cookies, or fetch. Everything must be self-contained.',
    `User request: ${prompt}`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ---------------------------------------------------------------------------
// 6. Goals extraction
// ---------------------------------------------------------------------------

/** Extracts daily macro goals for the setMacroGoals frontend tool. */
export function buildGoalsExtractionPrompt(prompt: string): string {
  return [
    'Extract the daily macro goals the user wants to set. Return JSON only.',
    'Include only the goals the user actually mentioned: calories (kcal), protein (g), carbs (g), fat (g).',
    `User request: ${prompt}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 7. Chat
// ---------------------------------------------------------------------------

/** System prompt for the plain conversational path (streamed). */
export function buildChatSystemPrompt(context: string): string {
  return [
    macroQuestPersona,
    context,
    'Answer briefly (a few sentences). Use the trusted app state to answer questions about logged meals, goals, and remaining macros.',
    'You cannot render UI in this mode. If the user wants to track a new meal, ask them to describe it or attach a photo; for lighter versions of the current meal, suggest asking for a lighter swap.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// 8. Assistant copy (status/error lines the agent streams verbatim)
// ---------------------------------------------------------------------------

export const assistantCopy = {
  // A2UI apply action
  missingPendingDraft:
    'I could not find the pending meal draft for that A2UI surface. Please analyze the meal again.',
  applyingMacros: 'Applying the approved macros to the MacroQuest dashboard...',
  mealLogged: 'Logged — the MacroQuest dashboard is up to date.',

  // Meal analysis
  scanningImage: 'Scanning the attached meal image with local Gemma 4...',
  estimatingFromText: 'Estimating macros from your description with local Gemma 4...',
  mealEstimateFailed:
    '\nI couldn\'t turn that into a meal estimate. Try describing a meal (e.g. "grilled chicken with rice") or attach a food photo.',
  mealSurfaceReady: (foods: string) =>
    `\nLocal Gemma found ${foods} and generated an interactive A2UI review surface. Use its apply button to update the MacroQuest dashboard.`,

  // Macro Swap Lab
  generatingSwapLab: 'Generating a Macro Swap Lab with local Gemma 4...',
  swapLabFailed: "\nI couldn't generate the swap lab this time. Please try asking again.",
  swapLabReady: '\nUse its apply button to update the current MacroQuest meal.',

  // Macro chart
  drawingChart: 'Drawing your macro progress chart with local Gemma 4...',
  chartFailed: "\nI couldn't draw the chart this time. Please try asking again.",

  // Goals
  askForGoals: 'Tell me the daily goals to set, e.g. "2000 calories and 150g protein".',
  settingGoals: (summary: string) => `Setting your daily goals: ${summary}.`,

  // Chat
  modelUnreachable: 'The local model is not reachable right now. Is the llama.cpp server running?',
};
