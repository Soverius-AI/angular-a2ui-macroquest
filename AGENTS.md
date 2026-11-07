# MacroQuest implementation guidance

This branch is the talk's starting point. MacroQuest is an Angular 22 meal log
with a CopilotKit chat. The meal log lives in `MacroQuestStore` as one
signal. The agent answers from a system prompt only. The state snapshot,
frontend tools, A2UI, and Open Generative UI are intentionally absent. Add one
of them only when implementing that beat in `talk-script.md`. Keep
implementation changes small, visible, and reliable enough for a live talk.

The Angular feature lives under `src/app/macroquest/`. Preserve its existing
boundaries: pure nutrition types and calculations belong in `domain/`, the
meal-log service belongs in `application/`, and standalone Angular UI belongs
in `ui/`.

The runtime under `server/` is one CopilotKit `BuiltInAgent`. It answers from
the system prompt and does not define tools. When the frontend later attaches
a snapshot, that agent includes it on its own.

Use the repository's Angular 22 and signal-based patterns. Preserve keyboard
and assistive-technology behavior for UI changes. Do not alter secrets, local
model files, generated build output, or presentation assets unless the issue
explicitly requires it.

Before finishing, run `pnpm build`. Run focused tests relevant to the change
when available. Do not start or download a model unless the issue explicitly
requires live-model validation.
