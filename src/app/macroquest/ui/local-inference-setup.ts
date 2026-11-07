import { Component, inject, signal } from '@angular/core';
import { BROWSER_LOCAL_RUNTIME, defaultBrowserModel } from '../application/browser-local-runtime';

@Component({
  selector: 'app-local-inference-setup',
  templateUrl: './local-inference-setup.html',
})
export class LocalInferenceSetup {
  protected readonly runtime = inject(BROWSER_LOCAL_RUNTIME);
  protected readonly model = defaultBrowserModel;
  protected readonly cache = signal(true);
  protected readonly allowWasmFallback = signal(true);
  protected readonly consent = signal(false);
  protected readonly error = signal('');

  protected async load(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.consent()) return;
    this.error.set('');
    try {
      await this.runtime.load(this.model, this.cache(), this.allowWasmFallback());
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    }
  }
}
