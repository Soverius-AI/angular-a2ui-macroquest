import { Component, inject, signal } from '@angular/core';
import {
  ByokProviderCard,
  type ByokConnectRequest,
  type ByokProvider,
} from '../../byok-card/byok-provider-card';
import { BYOK_RUNTIME, providerIds, providers, type ProviderId } from '../application/byok-runtime';

/** MacroQuest's use of the reusable card: branding in, the key out to the worker. */
@Component({
  selector: 'app-provider-setup',
  imports: [ByokProviderCard],
  template: `
    <main class="mx-auto flex h-dvh w-full max-w-5xl items-center px-4 py-4 sm:px-8">
      <byok-provider-card
        [providers]="cardProviders"
        productName="MacroQuest"
        eyebrow="Bring your own key"
        tagline="Agent in the browser, no backend"
        [badge]="{ logo: 'brand/google.svg', text: 'Gemini models' }"
        [facts]="facts"
        [footer]="{
          logo: 'brand/soverius.svg',
          text: 'A Soverius AI demo',
          href: 'https://soverius.ai',
        }"
        smallPrint="Requires HTTPS or localhost. Nutrition estimates are for demonstration, not medical advice."
        [status]="runtime.status()"
        [connecting]="runtime.connecting()"
        [error]="error()"
        (connect)="connect($event)"
      />
    </main>
  `,
})
export class ProviderSetup {
  protected readonly runtime = inject(BYOK_RUNTIME);
  protected readonly error = signal('');
  protected readonly cardProviders: ByokProvider[] = providerIds.map((id) => ({
    id,
    name: providers[id].name,
    host: providers[id].host,
    defaultModel: providers[id].defaultModel,
    models: [...providers[id].models],
    keyPlaceholder: providers[id].keyPlaceholder,
    keysUrl: providers[id].keysUrl,
    logo: `brand/${id}.svg`,
  }));
  protected readonly facts = [
    { label: 'Key', value: "kept in this tab's memory, never stored" },
    { label: 'Agent', value: 'CopilotKit tools, A2UI and generative UI, photo analysis' },
    { label: 'Backend', value: 'none: this page talks to the provider directly' },
  ];

  protected async connect({ provider, model, apiKey }: ByokConnectRequest): Promise<void> {
    this.error.set('');
    try {
      await this.runtime.connect(provider as ProviderId, apiKey, model);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    }
  }
}
