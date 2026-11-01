import { Component, input } from '@angular/core';
import { ActivityMessage } from '@ag-ui/core';

/** Chat placeholder; the shell renders the actual A2UI surface. */
@Component({
  selector: 'mq-a2ui-location',
  template: `<p role="status" class="text-sm text-base-content/60">Shown in the main area.</p>`,
})
export class A2uiLocation {
  readonly activityType = input.required<string>();
  readonly content = input.required<unknown>();
  readonly message = input.required<ActivityMessage>();
  readonly agent = input(undefined);
}
