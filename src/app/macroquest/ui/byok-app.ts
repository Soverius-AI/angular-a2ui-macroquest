import { Component, inject } from '@angular/core';
import { BYOK_RUNTIME } from '../application/byok-runtime';
import { MacroQuestShell } from './macroquest-shell';
import { ProviderSetup } from './provider-setup';

@Component({
  selector: 'app-root',
  imports: [ProviderSetup, MacroQuestShell],
  styles: `
    .brand-chip {
      display: inline-flex;
      align-items: center;
      border-radius: 0.375rem;
      background: #ffffff;
      padding: 0.2rem 0.5rem;
    }
    .brand-chip img {
      height: 16px;
      width: auto;
    }
  `,
  template: `
    @if (runtime.ready()) {
      <div class="byok-frame">
        <div class="bg-emerald-950 px-4 py-2 text-sm text-emerald-50" role="status">
          <div class="mx-auto flex max-w-7xl items-center gap-3">
            <a
              class="brand-chip"
              href="https://soverius.ai"
              target="_blank"
              rel="noopener"
              aria-label="Soverius AI"
            >
              <img src="brand/soverius.svg" alt="Soverius AI" height="16" />
            </a>
            <span class="h-2 w-2 shrink-0 rounded-full bg-emerald-400" aria-hidden="true"></span>
            <span class="min-w-0 flex-1 truncate">
              {{ runtime.model() }} via {{ runtime.providerName() }} · key kept in this tab · no
              backend
            </span>
            <button
              class="btn btn-ghost btn-xs rounded-full text-emerald-100"
              type="button"
              (click)="runtime.disconnect()"
            >
              Change provider
            </button>
          </div>
        </div>
        <div class="byok-content">
          <mq-shell />
        </div>
      </div>
    } @else {
      <app-provider-setup />
    }
  `,
})
export class ByokApp {
  protected readonly runtime = inject(BYOK_RUNTIME);
}
