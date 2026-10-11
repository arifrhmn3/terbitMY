/**
 * Converts between an alarm's hour/minute and the Date a native time picker
 * works with. Only the local hour and minute matter; the date part is a
 * fixed placeholder so the value never changes when the day changes.
 */
export function pickerDateFor(hour: number, minute: number): Date {
  return new Date(2000, 0, 1, hour, minute, 0, 0);
}

export function timeFromPickerDate(date: Date): { hour: number; minute: number } {
  return { hour: date.getHours(), minute: date.getMinutes() };
}
