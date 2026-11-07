# MacroQuest talk script

The `init` branch contains beat 1. Beats 2 through 7 are not in this branch.

Six beats, then one optional closer. Each beat adds one idea. The meal log is already loaded. Stay on Today before you start.

Say the names out loud the first time they appear:

- **Agentic UI** is the product: a person and an agent share one screen.
- **AG-UI** is the protocol that carries messages, the state snapshot, and tool calls.
- **Human in the loop** is a pause before a write. The chat is where it shows up. The pause is the feature.
- **Generative UI** is the family name.
- **A2UI** is the declarative band: the model fills a catalog the app already renders.
- **Open Generative UI** is the open band: the model writes a page, and the app runs it in a sandbox.

The four pills on the empty chat are prewritten prompts. Say that before anyone clicks one, or they will be taken for generated UI. Leave **Lighter swap** and **Chart my macros** unclicked until the closer.

## 1. Chat and a system prompt

Ask something the log cannot answer, for example: "What does this app track?"

The answer comes from the system prompt in `buildChatSystemPrompt`. Nothing on the dashboard moves. This already works.

## 2. The state snapshot

Not built yet. Add a computed snapshot on `MacroQuestStore` and pass it to `connectAgentContext`. The built-in agent adds that copy to the system prompt. Then ask: "How much can I still eat today?"

The chat answers from that snapshot. On the mock day that is 0 kcal left and 38 g of protein left. The server does not read the service. It receives a copy on that run.

Do not ask about yesterday yet. The snapshot only contains the day on screen.

## 3. A frontend tool

Say: "Switch to yesterday."

The day arrows move, and Yesterday's log is on screen (2207 kcal). Ask how much is left again. The numbers change because the next run brought a new snapshot, not because the server remembered the log.

`showPreviousDay` exists on `MacroQuestStore`. It is not a CopilotKit tool yet, so this beat still has to be built.

## 4. An activity message

Attach a meal photo.

Before the photo is sent, the chat shows an activity message: "Looking at the photo." The server tool `analyze_meal` then sends the photo. When the meal draft comes back, that same activity updates: "Estimate ready," and the title. The meal log does not change.

The draft is `mealDraftSchema`: title, notes, and foods, with per-serving calories, protein, carbs, and fat. It is not a meal yet. There is no id, no time, and no status. `registerRenderActivityMessage` draws the activity in the chat. The handler emits it before the photo request and again when the draft is parsed.

This beat is not built. It comes before the meal is saved.

## 5. Human in the loop

The estimate is already in the chat. Ask to add the meal.

The model calls one frontend tool, `applyMealDraft`, with that draft. Register that tool with `registerHumanInTheLoop`. The chat shows the estimate and waits. Confirm calls `store.applyMealDraft`. `createMeal` adds the id, the current time, and the status, and the meal appears on the day on screen. Cancel writes nothing.

The day tools from beat 3 stay `registerFrontendTool` and run immediately. Only this write pauses.

The prompt in `server/agent.ts` tells the model to call `applyMealDraft` to save. The tool parameters are `mealDraftSchema`.

This beat is not built.

## 6. A2UI, inside the chat

The meal is already estimated and, after confirmation, already logged. This beat only draws a card.

A card appears in the chat. Say that the model filled the catalog the app already renders. The card does not estimate the meal again, and its button is not a second confirmation. This beat is not on the `init` branch.

## 7. Closer, if there is a minute: Open Generative UI

Name the sandbox before you click. Then ask for the macro chart.

The chart only reads the snapshot and draws a picture the app did not design. The swap lab is the deeper example, because its button may call only `applyMacroSwap`, but it is model-written JavaScript and the beat most likely to fail live. Show the chart.

## Leave out

- "How much did I eat yesterday?" while Today is still on screen.
- A generated card placed on the dashboard. The page already shows meals outside the chat, so that looks like the existing layout.
- The swap lab, unless the chart has already landed and you still want the sandbox boundary.
- Calling human in the loop "chat UI", or calling agentic UI "AG-UI".
