import { Component, inject } from '@angular/core';
import { BROWSER_LOCAL_RUNTIME } from '../application/browser-local-runtime';
import { LocalInferenceSetup } from './local-inference-setup';
import { MacroQuestShell } from './macroquest-shell';

@Component({
  selector: 'app-root',
  imports: [LocalInferenceSetup, MacroQuestShell],
  template: `
    @if (runtime.ready()) {
      <div class="bg-emerald-950 px-4 py-2 text-center text-sm text-emerald-50" role="status">
        Browser-local · Gemma 4 E2B · Transformers.js /
        {{ runtime.device() === 'wasm' ? 'WASM / CPU' : 'WebGPU' }} · No inference backend
      </div>
      <mq-shell />
    } @else {
      <app-local-inference-setup />
    }
  `,
})
export class BrowserLocalApp {
  protected readonly runtime = inject(BROWSER_LOCAL_RUNTIME);
}
