/**
 * MacroQuest runtime entrypoint: CopilotRuntime + Hono HTTP server.
 *
 * The actual behavior lives in the sibling modules — config (env), agent
 * (intent routing), meal-surface / goals (generation + validation),
 * open-generative-ui (model-to-CopilotKit streaming), model-client (llama.cpp /
 * OpenRouter transport), prompts and schemas (model I/O contracts).
 */
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
  InMemoryAgentRunner,
} from '@copilotkit/runtime/v2';
import { agent, macroQuestA2UIToolName } from './agent';
import { modelBaseUrl, modelName, modelProvider, port } from './config';

const basicA2UICatalogId = 'https://a2ui.org/specification/v0_9/basic_catalog.json';

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
  '*',
  cors({
    origin: ['http://127.0.0.1:4302', 'http://localhost:4302'],
    allowMethods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'x-copilotcloud-public-api-key',
    ],
    exposeHeaders: ['Content-Type'],
    credentials: true,
    maxAge: 86400,
  }),
);

app.get('/health', (c) =>
  c.json({
    ok: true,
    runtime: 'macroquest',
    provider: modelProvider,
    agent: 'macroquest-custom',
    modelBaseUrl,
    modelName,
  }),
);

const copilotHandler = createCopilotRuntimeHandler({
  runtime,
  basePath: '/api/copilotkit',
});

app.all('/api/copilotkit/*', (c) => copilotHandler(c.req.raw));

const server = serve({ fetch: app.fetch, port });
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${port} is already in use. Stop the existing process or set PORT to another value.`,
    );
    process.exit(1);
  }

  throw error;
});

console.log(`MacroQuest runtime listening at http://127.0.0.1:${port}/api/copilotkit`);
console.log(`Model provider: ${modelProvider} (custom MacroQuest agent → A2UI / sandbox)`);
console.log(`Model endpoint: ${modelBaseUrl}`);
console.log(`Model name: ${modelName}`);
