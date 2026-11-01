import { ActivityMessage } from '@ag-ui/core';
import { Component, input, Signal } from '@angular/core';
import { ActivityRenderer } from '@copilotkit/angular';
import { unknown } from 'zod';

@Component({
  template: '',
})
export class NoopActivity implements ActivityRenderer {
  readonly agent = input(undefined);
  readonly activityType = input('');
  readonly content = input('');
  readonly message = input.required<ActivityMessage>();
}
