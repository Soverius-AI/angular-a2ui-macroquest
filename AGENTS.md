# MacroQuest implementation guidance

MacroQuest is an Angular 22 demonstration application for CopilotKit Angular,
A2UI, Open Generative UI, and NgRx Signal Store. Keep implementation changes
small, visible, and reliable enough for a live talk.

The Angular feature lives under `src/app/macroquest/`. Preserve its existing
boundaries: pure nutrition types and calculations belong in `domain/`, state
and CopilotKit integration belong in `application/`, and standalone Angular UI
belongs in `ui/`. `MacroQuestStore` composes `withMacroQuest()` before
`withCopilotKit()` because the CopilotKit feature consumes the store state and
methods established by the domain feature.

The runtime under `server/` validates model output and transports it through
CopilotKit. The model authors A2UI component trees and sandbox payloads; do not
replace that with hardcoded server-side layouts or fallback widgets. Preserve
the sandbox trust boundary: generated code communicates through
`Websandbox.connection.remote`, not browser storage, cookies, or same-origin
network access.

Use the repository's Angular 22 and signal-based patterns. Preserve keyboard
and assistive-technology behavior for UI changes. Do not alter secrets, local
model files, generated build output, or presentation assets unless the issue
explicitly requires it.

Before finishing, run `pnpm build`. Run focused tests relevant to the change
when available. Do not start or download a model unless the issue explicitly
requires live-model validation.
