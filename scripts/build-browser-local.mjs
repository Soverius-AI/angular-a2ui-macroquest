import { build } from 'esbuild';
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Generated code + the installed SDK's matching ORT runtime. Never download weights.
const fixture = process.argv.includes('--test-fixture');
const output = fixture ? 'tmp/browser-local-test' : 'tmp/browser-local';
await rm(output, { recursive: true, force: true });
await mkdir(`${output}/browser-local`, { recursive: true });
const common = {
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  minify: !fixture,
  logLevel: 'info',
};
await build({
  ...common,
  entryPoints: ['browser-local/service-worker.ts'],
  outfile: `${output}/browser-local-sw.js`,
});
await build({
  ...common,
  entryPoints: ['browser-local/agent-worker.ts'],
  outdir: `${output}/browser-local`,
  splitting: !fixture,
  plugins: fixture
    ? [
        {
          name: 'test-only-model',
          setup(builder) {
            builder.onResolve({ filter: /^\.\/transformers-model-client$/ }, () => ({
              path: new URL('../tests/browser-local/model-fixture.ts', import.meta.url).pathname,
            }));
          },
        },
      ]
    : [],
});
if (!fixture) {
  const require = createRequire(import.meta.url);
  const sdkRequire = createRequire(require.resolve('@huggingface/transformers'));
  const ortDirectory = dirname(sdkRequire.resolve('onnxruntime-web'));
  const target = `${output}/browser-local/ort`;
  await mkdir(target, { recursive: true });
  for (const name of await readdir(ortDirectory)) {
    if (/^ort-wasm-.*\.(mjs|wasm)$/.test(name))
      await cp(join(ortDirectory, name), join(target, name));
  }
}
if (fixture) {
  await build({
    ...common,
    entryPoints: ['tests/browser-local/transformers-worker-probe.ts'],
    outfile: `${output}/transformers-worker-probe.js`,
  });
  console.warn('TEST FIXTURE BUILD — not real inference. Do not deploy these generated assets.');
}
