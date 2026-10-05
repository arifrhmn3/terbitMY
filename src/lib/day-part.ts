export type DayPart = 'night' | 'morning' | 'afternoon' | 'evening';

/** Groups a local time into the part of the day used by the Today screen. */
export function getDayPart(date: Date): DayPart {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

const greetings: Record<DayPart, string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
  night: 'Time to wind down',
};

export function getGreeting(date: Date): string {
  return greetings[getDayPart(date)];
}
