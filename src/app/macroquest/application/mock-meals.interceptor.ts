import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { createFriendHistory, FriendDayLog } from '../domain/friend-day';

export const mealLogUrl = '/api/meals';

/** Answers the store's meal-log request with the mocked friend day. */
export const mockMealsInterceptor: HttpInterceptorFn = (request, next) => {
  if (request.url !== mealLogUrl) return next(request);
  return of(new HttpResponse({ body: returnMockedData() }));
};

function returnMockedData(): FriendDayLog[] {
  return createFriendHistory();
}
