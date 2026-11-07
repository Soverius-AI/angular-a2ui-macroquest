import { Component, computed, effect, input, output, signal } from '@angular/core';

/** One hosted provider the user can connect with their own key. */
export interface ByokProvider {
  id: string;
  name: string;
  /** Host shown in the consent line, e.g. "openrouter.ai". */
  host: string;
  defaultModel: string;
  models: { id: string; label: string }[];
  keyPlaceholder: string;
  keysUrl: string;
  /** Logo URL for the plate tile. */
  logo?: string;
}

export interface ByokConnectRequest {
  provider: string;
  model: string;
  /** Hand this to wherever the key must live; the card clears its own copy afterwards. */
  apiKey: string;
}

export interface ByokBrand {
  logo?: string;
  text: string;
  href?: string;
}

/**
 * "Bring your own key" provider card. Self-contained: no services, no storage, no
 * network. It collects a provider, a model and a key, and emits them once through
 * `connect`; the host decides where the key goes. Styled with Tailwind + daisyUI
 * utility classes, so a host needs those (or can restyle the template).
 */
@Component({
  selector: 'byok-provider-card',
  templateUrl: './byok-provider-card.html',
  styles: `
    .byok-plate {
      background:
        radial-gradient(120% 80% at 100% 0%, rgba(122, 162, 255, 0.35), transparent 60%),
        linear-gradient(160deg, #1a2a6c 0%, #2b3fb0 55%, #4f46e5 100%);
    }
    .byok-tile {
      box-shadow: 0 10px 24px rgba(10, 20, 80, 0.35);
    }
    .byok-specs dd {
      min-width: 0;
    }
    .byok-option:has(input:focus-visible) {
      outline: 2px solid #ffffff;
      outline-offset: 2px;
    }
  `,
})
export class ByokProviderCard {
  /** Providers to offer; the first one is selected initially. */
  readonly providers = input.required<ByokProvider[]>();
  /** Product name on the plate. */
  readonly productName = input('Your app');
  /** Small line above the product name. */
  readonly eyebrow = input('Bring your own key');
  /** Line under the product name. */
  readonly tagline = input('Agent in the browser, no backend');
  /** Optional badge in the plate's top-right corner, e.g. a vendor mark. */
  readonly badge = input<ByokBrand | undefined>(undefined);
  /** Rows of the spec list on the plate. */
  readonly facts = input<{ label: string; value: string }[]>([]);
  /** Footer attribution under the form. */
  readonly footer = input<ByokBrand | undefined>(undefined);
  /** Small print under the status line. */
  readonly smallPrint = input('');
  /** Host-owned state. */
  readonly status = input('');
  readonly connecting = input(false);
  readonly error = input('');

  readonly connect = output<ByokConnectRequest>();

  protected readonly providerId = signal('');
  protected readonly selected = computed(
    () =>
      this.providers().find((provider) => provider.id === this.providerId()) ??
      this.providers()[0]!,
  );
  /** A preset id, or '' for the custom field. */
  protected readonly preset = signal('');
  protected readonly customModel = signal('');
  protected readonly model = computed(() => this.preset() || this.customModel().trim());
  /** Held only until emitted; never persisted. */
  protected readonly apiKey = signal('');
  protected readonly consent = signal(false);
  protected readonly canConnect = computed(
    () => this.consent() && this.apiKey().trim().length > 0 && !!this.model() && !this.connecting(),
  );

  constructor() {
    effect(() => {
      const first = this.providers()[0];
      if (first && !this.providerId()) this.choose(first.id);
    });
  }

  protected choose(providerId: string): void {
    this.providerId.set(providerId);
    this.preset.set(this.selected().defaultModel);
    this.customModel.set('');
  }

  protected pick(preset: string): void {
    this.preset.set(preset);
    if (preset) this.customModel.set('');
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (!this.canConnect()) return;
    const apiKey = this.apiKey().trim();
    this.apiKey.set('');
    this.connect.emit({ provider: this.selected().id, model: this.model(), apiKey });
  }
}
