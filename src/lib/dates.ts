const MS_DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const dayMs = (day: string) => Date.parse(`${day.slice(0, 10)}T00:00:00.000Z`);

export function addDays(day: string, n: number): string {
  return new Date(dayMs(day) + n * MS_DAY).toISOString().slice(0, 10);
}

export const monthKey = (ts: string): string => ts.slice(0, 7);

export function monthEnd(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export const daysBetween = (a: string, b: string): number => Math.round((dayMs(b) - dayMs(a)) / MS_DAY);

export const isWithin = (ts: string, fromExclusive: string, toInclusive: string): boolean =>
  ts > fromExclusive && ts <= toInclusive;

export function formatDay(day: string): string {
  return `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}, ${day.slice(0, 4)}`;
}

export const monthLabel = (month: string): string => MONTHS[Number(month.slice(5, 7)) - 1]!;
