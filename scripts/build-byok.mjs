import { build } from 'esbuild';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';

// Generated code only: the service-worker facade and the agent worker.
const fixture = process.argv.includes('--test-fixture');
const require = createRequire(import.meta.url);
const runtimeVersion = JSON.parse(
  await readFile(require.resolve('@copilotkit/runtime/package.json'), 'utf8'),
).version;
// @ag-ui/a2ui-middleware imports Node's crypto for randomUUID; the Web Crypto API provides it.
const browserShims = {
  name: 'browser-shims',
  setup(builder) {
    builder.onResolve({ filter: /^crypto$/ }, () => ({
      path: new URL('../byok/node-crypto-shim.ts', import.meta.url).pathname,
    }));
  },
};
const output = fixture ? 'tmp/byok-test' : 'tmp/byok';
await rm(output, { recursive: true, force: true });
await mkdir(`${output}/byok`, { recursive: true });
const common = {
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  minify: !fixture,
  logLevel: 'info',
  define: { __COPILOTKIT_RUNTIME_VERSION__: JSON.stringify(runtimeVersion) },
};
await build({
  ...common,
  entryPoints: ['byok/service-worker.ts'],
  outfile: `${output}/byok-sw.js`,
});
await build({
  ...common,
  entryPoints: ['byok/agent-worker.ts'],
  outdir: `${output}/byok`,
  splitting: !fixture,
  plugins: [
    browserShims,
    ...(fixture
      ? [
          {
            name: 'test-only-model',
            setup(builder) {
              builder.onResolve({ filter: /^\.\/openai-compatible-model-client$/ }, () => ({
                path: new URL('../tests/byok/model-fixture.ts', import.meta.url).pathname,
              }));
            },
          },
        ]
      : []),
  ],
});
if (fixture)
  console.warn('TEST FIXTURE BUILD — no model requests. Do not deploy these generated assets.');
