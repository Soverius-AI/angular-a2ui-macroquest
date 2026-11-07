// Model-free smoke test of the real published browser SDK and self-hosted ORT paths.
import {
  AutoTokenizer,
  Gemma4ForConditionalGeneration,
  TextStreamer,
  InterruptableStoppingCriteria,
  env,
} from '@huggingface/transformers';
import {
  configureTransformersEnvironment,
  TRANSFORMERS_MODEL_ID,
  TRANSFORMERS_MODEL_REVISION,
} from '../../browser-local/transformers-model-client';

self.onmessage = async ({ data }) => {
  try {
    configureTransformersEnvironment(
      env,
      { model: TRANSFORMERS_MODEL_ID, wasmUrl: data.wasmUrl, cache: false },
      self.location.href,
    );
    const paths = env.backends.onnx.wasm!.wasmPaths as { mjs: string; wasm: string };
    const [script, binary] = await Promise.all([
      fetch(paths.mjs, { method: 'HEAD' }),
      fetch(paths.wasm, { method: 'HEAD' }),
    ]);
    if (!script.ok || !binary.ok)
      throw new Error('Matching ONNX Runtime assets were not deployed.');
    if (
      !script.headers.get('Content-Type')?.includes('javascript') ||
      !binary.headers.get('Content-Type')?.includes('wasm')
    )
      throw new Error('Incorrect ONNX runtime MIME types.');
    self.postMessage({
      ok: true,
      version: env.version,
      model: TRANSFORMERS_MODEL_ID,
      revision: TRANSFORMERS_MODEL_REVISION,
      tokenizer: typeof AutoTokenizer.from_pretrained,
      modelLoader: typeof Gemma4ForConditionalGeneration.from_pretrained,
      streamer: typeof TextStreamer,
      interruption: typeof new InterruptableStoppingCriteria().interrupt,
      cache: env.useBrowserCache,
      threads: env.backends.onnx.wasm!.numThreads,
    });
  } catch (error) {
    self.postMessage({ ok: false, error: String(error) });
  }
};
