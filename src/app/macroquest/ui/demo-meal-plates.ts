import { NgOptimizedImage } from '@angular/common';
import { Component, input, signal } from '@angular/core';
import { Attachment, CopilotChat } from '@copilotkit/angular';

interface DemoPlate {
  readonly id: string;
  readonly label: string;
  readonly src: string;
  readonly filename: string;
}

/** CopilotKit requires non-empty text to enable send, even with attachments. */
const MEAL_PHOTO_PROMPT = 'What am I eating?';

@Component({
  selector: 'mq-demo-meal-plates',
  imports: [NgOptimizedImage],
  template: `
    <div class="border-b border-base-300/70 bg-base-100 px-5 py-3" aria-label="Demo meal plates">
      <div class="flex items-baseline justify-between gap-3">
        <p class="text-xs font-bold uppercase tracking-wide text-base-content/55">Demo plates</p>
        <p class="text-xs text-base-content/45">Click to attach and fill a starter prompt</p>
      </div>
      <div class="mt-2 flex gap-2 overflow-x-auto pb-1">
        @for (plate of plates; track plate.id) {
          <button
            type="button"
            class="group flex w-20 shrink-0 flex-col gap-1.5 text-left disabled:opacity-60"
            [disabled]="attachingPlateId() !== null"
            [attr.aria-busy]="attachingPlateId() === plate.id"
            [attr.aria-label]="'Attach ' + plate.label + ' photo'"
            (click)="attachPlate(plate)"
          >
            <span
              class="relative block overflow-hidden rounded-xl border border-base-300/80 bg-base-200 transition group-hover:border-primary/50 group-hover:shadow-sm group-focus-visible:border-primary group-focus-visible:ring-2 group-focus-visible:ring-primary/30"
              [class.ring-2]="attachingPlateId() === plate.id"
              [class.ring-primary]="attachingPlateId() === plate.id"
            >
              <img
                [ngSrc]="plate.src"
                [alt]="plate.label"
                width="80"
                height="80"
                class="h-20 w-20 object-cover"
              />
              @if (attachingPlateId() === plate.id) {
                <span class="absolute inset-0 grid place-items-center bg-base-100/55">
                  <span class="loading loading-spinner loading-sm text-primary"></span>
                </span>
              }
            </span>
            <span class="truncate px-0.5 text-[11px] font-semibold leading-tight text-base-content/70">
              {{ plate.label }}
            </span>
          </button>
        }
      </div>
      @if (attachError(); as error) {
        <p class="mt-2 text-xs text-error" role="alert">{{ error }}</p>
      }
    </div>
  `,
})
export class DemoMealPlates {
  readonly chat = input<CopilotChat | undefined>();

  protected readonly attachingPlateId = signal<string | null>(null);
  protected readonly attachError = signal<string | null>(null);

  protected readonly plates: readonly DemoPlate[] = [
    {
      id: 'schnitzel',
      label: 'Schnitzel',
      src: '/meals/schnitzel.jpg',
      filename: 'schnitzel.jpg',
    },
    {
      id: 'wuerstel',
      label: 'Würstel',
      src: '/meals/wuerstel.jpg',
      filename: 'wuerstel.jpg',
    },
    {
      id: 'kaiserschmarrn',
      label: 'Kaiserschmarrn',
      src: '/meals/kaiserschmarrn.jpg',
      filename: 'kaiserschmarrn.jpg',
    },
    {
      id: 'tafelspitz',
      label: 'Tafelspitz',
      src: '/meals/tafelspitz.jpg',
      filename: 'tafelspitz.jpg',
    },
    {
      id: 'sacher',
      label: 'Sacher torte',
      src: '/meals/sacher%20torte.jpg',
      filename: 'sacher torte.jpg',
    },
  ];

  protected async attachPlate(plate: DemoPlate): Promise<void> {
    const chat = this.chat();
    if (!chat || this.attachingPlateId() !== null) {
      return;
    }

    this.attachingPlateId.set(plate.id);
    this.attachError.set(null);

    try {
      const response = await fetch(plate.src);
      if (!response.ok) {
        throw new Error(`Could not load ${plate.label}`);
      }

      const blob = await response.blob();
      const mimeType = blob.type || 'image/jpeg';
      const value = await this.#blobToBase64(blob);
      const attachment: Attachment = {
        id: crypto.randomUUID(),
        type: 'image',
        source: { type: 'data', value, mimeType },
        filename: plate.filename,
        size: blob.size,
        status: 'ready',
      };

      // Keep one demo plate attached so the composer stays tidy for talks.
      chat.attachments.update((current) => [
        ...current.filter((item) => item.status !== 'ready'),
        attachment,
      ]);

      // CopilotKit only enables send when the prompt is non-empty.
      if (!chat.inputValue().trim()) {
        chat.changeInput(MEAL_PHOTO_PROMPT);
      }
    } catch (error) {
      this.attachError.set(
        error instanceof Error ? error.message : `Could not attach ${plate.label}`,
      );
    } finally {
      this.attachingPlateId.set(null);
    }
  }

  async #blobToBase64(blob: Blob): Promise<string> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
          return;
        }
        reject(new Error('Failed to read image as base64'));
      };
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'));
      reader.readAsDataURL(blob);
    });

    const base64 = dataUrl.split(',')[1];
    if (!base64) {
      throw new Error('Failed to encode image');
    }
    return base64;
  }
}
