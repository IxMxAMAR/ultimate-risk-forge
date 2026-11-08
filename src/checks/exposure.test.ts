import { describe, expect, it } from 'vitest';
import { RULES_V1 } from '../domain/ruleset';
import type { DisputeStats } from './disputeMath';
import { coverage, exposure, holdToKeep, networkFines } from './exposure';

const rf0003: DisputeStats = {
  rate30d: 0.02, disputes30d: 10, payments30d: 500,
  byMonth: [],
  judgedMonths: ['2026-06', '2026-07', '2026-08'], immatureMonths: ['2026-09', '2026-10'],
  judgedRate: 0.023, judgedPayments: 1000, judgedDisputes: 23,
  byBrandJudged: [
    { brand: 'visa', payments: 326, disputes: 6, rate: 0.0184 },
    { brand: 'mastercard', payments: 194, disputes: 6, rate: 0.031 },
    { brand: 'amex', payments: 0, disputes: 0, rate: NaN },
    { brand: 'discover', payments: 0, disputes: 0, rate: NaN },
  ],
  refundRate: 0.006,
  reasonsJudged: { fraudulent: 0, not_received: 0, subscription_canceled: 0, product_unacceptable: 0, credit_not_processed: 0 },
  outcomesJudged: { won: 0, lost: 0, open: 0, winRate: NaN },
  growth: 5,
  openCount: 4, openAmount: 269100,
  avgJudgedDisputeAmount: 43000,
  immaturePayments: 1490,
  last30Sales: 0,
};

describe('exposure', () => {
  it('sums the RF-0003 rows', () => {
    const e = exposure(rf0003, RULES_V1);
    expect([e.expectedLow, e.expectedHigh]).toEqual([34, 46]);
    expect([e.low, e.high]).toEqual([1882100, 2616100]);
    expect(e.rows.map(r => r.key)).toEqual(['open', 'new', 'fees', 'fines']);
    expect(e.rows[0]!.label).toBe('4 disputes still open');
    expect(e.rows[1]!.label).toBe('New disputes on Sep–Oct sales');
    expect(e.rows[1]!.detail).toBe('1,490 payments × 2.3%–3.1% ≈ 34–46 disputes × $430 average');
  });

  it('holds with a buffer and reports coverage', () => {
    expect(holdToKeep(2616100, RULES_V1)).toBe(2800000);
    expect(coverage(2800000, 2616100)).toEqual({ covers: true, bufferPct: 7 });
    expect(coverage(2000000, 2616100).covers).toBe(false);
  });

  it('picks the ecm ladder between the two limits', () => {
    const s = { ...rf0003, byBrandJudged: [{ brand: 'mastercard' as const, payments: 194, disputes: 4, rate: 0.0206 }] };
    expect(networkFines(s, RULES_V1)).toEqual({ low: 100000, high: 200000, tier: 'ecm' });
  });

  it('omits fines under the Mastercard limit', () => {
    const s = { ...rf0003, byBrandJudged: [{ brand: 'mastercard' as const, payments: 194, disputes: 2, rate: 0.0103 }] };
    expect(networkFines(s, RULES_V1).tier).toBe('none');
    expect(exposure(s, RULES_V1).rows.map(r => r.key)).toEqual(['open', 'new', 'fees']);
  });

  it('falls back to the judged rate when no brand has enough payments', () => {
    const s = { ...rf0003, byBrandJudged: [{ brand: 'mastercard' as const, payments: 10, disputes: 1, rate: 0.1 }] };
    const e = exposure(s, RULES_V1);
    expect(e.expectedHigh).toBe(e.expectedLow);
    expect(e.highRate).toBe(0.023);
    expect(networkFines(s, RULES_V1).tier).toBe('none');
  });
});
