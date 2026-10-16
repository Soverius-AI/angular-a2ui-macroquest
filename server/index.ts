/**
 * MacroQuest runtime entrypoint: CopilotRuntime + Hono HTTP server.
 *
 * This branch serves one built-in chat agent. Config and the agent live in
 * the sibling modules.
 */
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
  InMemoryAgentRunner,
} from '@copilotkit/runtime/v2';
import { agent } from './agent';
import { modelBaseUrl, modelName, modelProvider, port } from './config';

const app = new Hono();

app.use(
  '*',
  cors({
    origin: ['http://localhost:4200'],
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
    agent: 'builtin',
    modelBaseUrl,
    modelName,
  }),
);

const runtime = new CopilotRuntime({
  agents: { default: agent },
  runner: new InMemoryAgentRunner(),
});

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
console.log(`Model provider: ${modelProvider}`);
console.log(`Model endpoint: ${modelBaseUrl}`);
console.log(`Model name: ${modelName}`);
