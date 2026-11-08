import { ceilTo, dollars, formatMoney, formatMoneyShort, pct, safeRate } from './money';

describe('money', () => {
  it('formats', () => {
    expect(formatMoney(4200000)).toBe('$42,000');
    expect(formatMoney(120050, { cents: true })).toBe('$1,200.50');
    expect(formatMoneyShort(1882100)).toBe('$18.8k');
    expect(ceilTo(2746905, 100000)).toBe(2800000);
    expect(dollars(42)).toBe(4200);
    expect(pct(0.023)).toBe('2.3%');
    expect(pct(NaN)).toBe('—');
    expect(safeRate(1, 0)).toBeNaN();
    expect(safeRate(1, 4)).toBe(0.25);
  });
});
