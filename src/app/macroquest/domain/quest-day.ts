/** Calendar day in the same UTC form as `MacroQuestState.activeDate`. */
export function questDate(dayOffset = 0, now = new Date()): string {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

export function shiftQuestDate(isoDate: string, dayOffset: number): string {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

/** Noon UTC, so the calendar day stays stable across time zones. */
export function capturedAtForDayOffset(dayOffset: number, now = new Date()): string {
  return `${questDate(dayOffset, now)}T12:00:00.000Z`;
}

export function formatQuestDay(activeDate: string, today = questDate()): string {
  if (activeDate === today) return 'Today';
  if (activeDate === shiftQuestDate(today, -1)) return 'Yesterday';

  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${activeDate}T12:00:00.000Z`));
}
