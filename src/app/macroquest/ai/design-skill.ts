/**
 * Design guidance for generateSandboxedUi widgets, sent to the agent as context by the
 * CopilotKit client. Carries over the dashboard look of the original MacroQuest prompts.
 */
export const macroQuestDesignSkill = `When generating UI with generateSandboxedUi, build a polished MacroQuest dashboard widget:

- Use the REAL numbers from the application context (meals, goals, totals). Never show placeholders such as "--", "TBD" or invented values.
- Hierarchy: a compact header with a one-line caption, then KPI cards with strong numerals, then chart cards. Each chart card has a title, a one-sentence caption and a visible legend.
- Macro colors: calories #059669, protein #6366f1, carbs #f59e0b, fat #ec4899. Surfaces are white or slate-50 (#f8fafc) with 1px #e5e7eb borders, 10px radii, system-ui text, #0f172a headings, #64748b secondary text. No gradients, no drop shadows.
- Charts are inline SVG only (bars, tracks, doughnuts with stroke-dasharray). Give every svg a viewBox, width: 100% and an explicit CSS height. No canvas, no external scripts, images, fonts or styles.
- Make it interactive where it helps: segmented toggles (for example percent vs absolute), hover states, focus-visible outlines, aria-pressed on toggles. Define functions in jsFunctions and wire listeners in jsExpressions.
- Responsive from 380px to 760px: KPI cards 2×2 on narrow widths and four across when possible; keep chart cards side by side, no horizontal scrolling. Compact spacing: 8–12px gaps, 10–14px padding.
- Pick initialHeight to fit the whole widget without an inner scrollbar (typically 420–620).
- Sandbox rules: no localStorage, sessionStorage, cookies or fetch; communicate only through the provided sandbox functions.`;
