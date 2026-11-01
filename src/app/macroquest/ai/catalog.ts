import { Component, input } from '@angular/core';
import {
  A2UICatalogDefinitions,
  ActionSchema,
  ChildListSchema,
  CopilotA2UIChild,
  DynamicStringSchema,
  createAngularCatalog,
} from '@copilotkit/angular/a2ui';
import z from 'zod3';
import { MatAnchor, MatButton } from '@angular/material/button';

const catalogDefiniton: A2UICatalogDefinitions = {
  // Button: {
  //   description: 'A simple button showing a label',
  //   props: z.object({
  //     label: DynamicStringSchema,
  //     action: ActionSchema.optional(),
  //   }),
  // },
  Text: {
    description: 'A text element',
    props: z.object({
      text: DynamicStringSchema,
    }),
  },
  // Row: {
  //   description: 'A row of child components',
  //   props: z.object({
  //     children: ChildListSchema,
  //   }),
  // },
};

@Component({
  template: `<button mat-raised-button (click)="action()?.()">{{ label() }}</button>`,
  imports: [MatButton],
})
export class Button {
  readonly label = input.required<string>();
  readonly action = input<() => void>();
}

@Component({
  template: `<p>{{ text() }}</p>`,
})
export class Text {
  readonly text = input.required<string>();
}

@Component({
  imports: [CopilotA2UIChild],
  template: `
    <div>
      @for (child of children(); track child) {
        <copilot-a2ui-child [child]="child" />
      }
    </div>
  `,
})
export class Row {
  readonly children = input.required<{ id: string; basePath?: string }[]>();
}

export const catalog = createAngularCatalog(
  catalogDefiniton,
  {
    Text,
  },
  { includeBasicCatalog: true },
);
