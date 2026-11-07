# byok-provider-card

A standalone Angular component for "bring your own key" setups: the user picks a
provider, a model preset (or types a model id), pastes an API key and confirms
where it goes. The component owns no services and touches no storage or network;
it emits one `connect` event and clears its copy of the key.

Copy this folder into another project. It needs Angular 20+ signals and
Tailwind with daisyUI classes (`input`, `select`, `checkbox`, `btn`, `base-*`
colors); restyle the template if your project uses something else.

```ts
import { ByokProviderCard, type ByokConnectRequest } from './byok-card/byok-provider-card';

@Component({
  imports: [ByokProviderCard],
  template: `
    <byok-provider-card
      [providers]="providers"
      productName="MacroQuest"
      tagline="Agent in the browser, no backend"
      [badge]="{ logo: 'brand/google.svg', text: 'Gemini models' }"
      [facts]="[{ label: 'Key', value: 'kept in memory, never stored' }]"
      [footer]="{ logo: 'brand/soverius.svg', text: 'A Soverius AI demo', href: 'https://soverius.ai' }"
      [status]="status()"
      [connecting]="connecting()"
      [error]="error()"
      (connect)="onConnect($event)"
    />
  `,
})
export class Setup {
  providers = [
    {
      id: 'openrouter',
      name: 'OpenRouter',
      host: 'openrouter.ai',
      defaultModel: 'google/gemini-3.8-flash',
      models: [{ id: 'google/gemini-3.8-flash', label: 'Gemini 3.8 Flash' }],
      keyPlaceholder: 'sk-or-v1-…',
      keysUrl: 'https://openrouter.ai/keys',
      logo: 'brand/openrouter.svg',
    },
  ];
  onConnect({ provider, model, apiKey }: ByokConnectRequest) {
    // hand the key to a worker, an in-memory client, etc.
  }
}
```

Inputs: `providers` (required), `productName`, `eyebrow`, `tagline`, `badge`,
`facts`, `footer`, `smallPrint`, `status`, `connecting`, `error`. Output:
`connect` with `{ provider, model, apiKey }`.
