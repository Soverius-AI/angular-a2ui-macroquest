import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { A2UIClientEventMessage, CopilotKit, injectAgentStore } from '@copilotkit/angular';
import { CopilotA2UISurface } from '@copilotkit/angular/a2ui';
import { catalog } from '../ai/catalog';

type Operation = Record<string, unknown>;
type A2UIComponent = { id?: string; component?: string; children?: unknown };

const mealCardComponent = 'MealCard';
const addMealAction = 'add_meal';

/**
 * Main-area host for the agent's A2UI surfaces. Actions are bridged to the agent the same
 * way the chat renderer does it: as the `a2uiAction` run property. Every `add_meal` action,
 * whether clicked here or in the chat, is observed through that property, and the logged
 * MealCard leaves the Recommended meals area; a surface with no MealCard left disappears.
 */
@Component({
  selector: 'mq-surface',
  template: `@if (operations().length) {
    <copilot-a2ui-surface
      [catalog]="catalog"
      [operations]="operations()"
      (action)="forward($event)"
    />
  }`,
  imports: [CopilotA2UISurface],
})
export class MacroQuestSurface {
  private readonly agentStore = injectAgentStore('default');
  private readonly copilotKit = inject(CopilotKit);
  protected readonly catalog = catalog;

  /** `surfaceId/componentId` of every MealCard whose meal was added to the log. */
  private readonly logged = signal<ReadonlySet<string>>(new Set());

  constructor() {
    const subscription = this.copilotKit.core.subscribe({
      onPropertiesChanged: ({ properties }) => {
        const action = (properties as { a2uiAction?: A2UIClientEventMessage }).a2uiAction
          ?.userAction;
        if (action?.name !== addMealAction || !action.surfaceId || !action.sourceComponentId)
          return;
        const key = `${action.surfaceId}/${action.sourceComponentId}`;
        if (!this.logged().has(key)) this.logged.update((set) => new Set(set).add(key));
      },
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  private readonly rendered = computed<Operation[]>(() =>
    this.agentStore()
      .messages()
      .flatMap((message) => {
        if (message.role !== 'activity' || message.activityType !== 'a2ui-surface') {
          return [];
        }

        const operations = message.content['a2ui_operations'];
        return Array.isArray(operations) ? operations : [operations];
      }),
  );

  /** True while the agent is still generating (or repairing) a surface for this area. */
  readonly building = computed(() =>
    this.agentStore()
      .messages()
      .some((message) => {
        if (message.role !== 'activity' || message.activityType !== 'a2ui-surface') return false;
        const status = (message.content as { status?: string })['status'];
        return status === 'building' || status === 'retrying';
      }),
  );

  /** True when a surface with content is on screen. */
  readonly hasSurface = computed(() => this.operations().length > 0);

  protected readonly operations = computed<Operation[]>(() => {
    const logged = this.logged();
    if (!logged.size) return this.rendered();
    const emptied = new Set<string>();
    const operations = this.rendered().flatMap((operation) => {
      const update = operation['updateComponents'] as
        { surfaceId?: string; components?: A2UIComponent[] } | undefined;
      if (!update?.surfaceId || !Array.isArray(update.components)) return [operation];
      const surfaceId = update.surfaceId;
      const removed = new Set(
        update.components
          .filter((component) => component.id && logged.has(`${surfaceId}/${component.id}`))
          .map((component) => component.id!),
      );
      if (!removed.size) return [operation];
      const components = update.components
        .filter((component) => !removed.has(component.id ?? ''))
        .map((component) =>
          Array.isArray(component.children)
            ? { ...component, children: component.children.filter((id) => !removed.has(id)) }
            : component,
        );
      if (!components.some((component) => component.component === mealCardComponent)) {
        emptied.add(surfaceId);
        return [];
      }
      return [{ ...operation, updateComponents: { ...update, components } }];
    });
    return operations.filter((operation) => !emptied.has(surfaceIdOf(operation) ?? ''));
  });

  protected async forward(message: A2UIClientEventMessage): Promise<void> {
    const agent = this.agentStore().agent;
    if (!agent) return;
    const core = this.copilotKit.core;
    try {
      core.setProperties({ ...core.properties, a2uiAction: message });
      await core.runAgent({ agent });
    } finally {
      const { a2uiAction: _dropped, ...rest } = core.properties as Record<string, unknown>;
      core.setProperties(rest);
    }
  }
}

function surfaceIdOf(operation: Operation): string | undefined {
  for (const key of ['createSurface', 'updateComponents', 'updateDataModel', 'deleteSurface']) {
    const surfaceId = (operation[key] as { surfaceId?: string } | undefined)?.surfaceId;
    if (surfaceId) return surfaceId;
  }
  return undefined;
}
