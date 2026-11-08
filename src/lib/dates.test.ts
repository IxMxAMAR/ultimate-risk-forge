import { addDays, daysBetween, formatDay, isWithin, monthEnd, monthKey, monthLabel } from './dates';

describe('dates', () => {
  it('dates are UTC', () => {
    expect(monthEnd('2026-02')).toBe('2026-02-28');
    expect(addDays('2026-11-08', 30)).toBe('2026-12-08');
    expect(monthKey('2026-06-30T23:59:59.000Z')).toBe('2026-06');
    expect(formatDay('2026-12-15')).toBe('Dec 15, 2026');
    expect(monthLabel('2026-06')).toBe('Jun');
    expect(daysBetween('2026-11-08', '2026-12-08')).toBe(30);
  });
  it('isWithin is exclusive-from, inclusive-to', () => {
    expect(isWithin('2026-06-02T00:00:00.000Z', '2026-06-01T00:00:00.000Z', '2026-06-02T00:00:00.000Z')).toBe(true);
    expect(isWithin('2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z', '2026-06-02T00:00:00.000Z')).toBe(false);
  });
});
