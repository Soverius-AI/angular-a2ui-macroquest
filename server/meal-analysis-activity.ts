import { BaseEvent, EventType } from '@ag-ui/core';
import { Observable } from 'rxjs';
import { mealAnalysisActivityType } from '../contracts/meal-analysis-activity';

const mealAnalysisMessageId = 'meal-analysis';

let reportMealAnalysis: ((title: string, phase: MealAnalysisPhase) => void) | undefined;

export type MealAnalysisPhase = 'sending' | 'ready' | 'error';

export function showMealAnalysis(title: string, phase: MealAnalysisPhase): void {
  reportMealAnalysis?.(title, phase);
}

export function forwardMealAnalysis(events: Observable<BaseEvent>): Observable<BaseEvent> {
  return new Observable((subscriber) => {
    const previous = reportMealAnalysis;
    reportMealAnalysis = (title, phase) => {
      subscriber.next({
        type: EventType.ACTIVITY_SNAPSHOT,
        messageId: mealAnalysisMessageId,
        activityType: mealAnalysisActivityType,
        content: { title, phase },
      });
    };
    const subscription = events.subscribe(subscriber);
    return () => {
      reportMealAnalysis = previous;
      subscription.unsubscribe();
    };
  });
}
