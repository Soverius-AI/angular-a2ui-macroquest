import { Component, input } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  ActionSchema,
  ChildListSchema,
  CopilotA2UIChild,
  type A2UICatalogDefinitions,
  type A2UIProps,
  createAngularCatalog,
} from '@copilotkit/angular/a2ui';
import { z } from 'zod3';

const definitions = {
  Label: {
    description: 'A label showing text',
    props: z.object({
      text: z.string(),
      children: ChildListSchema.optional(),
    }),
  },
  Button: {
    description: 'A button',
    props: z.object({
      label: z.string(),
      action: ActionSchema,
    }),
  },
} satisfies A2UICatalogDefinitions;

@Component({
  selector: 'mq-a2ui-label',
  imports: [CopilotA2UIChild],
  template: `
    <div class="flex flex-col items-start gap-2">
      <span>{{ text() }}</span>
      @for (child of children(); track child.id) {
        <copilot-a2ui-child [child]="child" />
      }
    </div>
  `,
})
export class A2uiLabel {
  readonly text = input.required<string>();
  readonly children = input<{ id: string; basePath?: string }[]>([]);
}

@Component({
  selector: 'mq-a2ui-button',
  imports: [MatButton],
  template: `
    <button matButton="filled" type="button" (click)="props().action?.()">
      {{ props().label }}
    </button>
  `,
})
export class A2uiButton {
  readonly props = input.required<A2UIProps<typeof definitions, 'Button'>>();
}

export const macroQuestCatalog = createAngularCatalog(definitions, {
  Label: A2uiLabel,
  Button: A2uiButton,
});
