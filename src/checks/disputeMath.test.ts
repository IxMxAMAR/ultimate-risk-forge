import { describe, expect, it } from 'vitest';
import { RULES_V1 } from '../domain/ruleset';
import type { Brand, Dispute, ForgedCase, Payment, Refund } from '../domain/types';
import { brandGroup, disputeStats, worstBrandRate } from './disputeMath';

declare const process: { env: Record<string, string | undefined> };

type Input = Pick<ForgedCase, 'asOf' | 'payments' | 'disputes' | 'refunds'>;

const pay = (id: string, day: string, amount: number, brand: Brand = 'visa'): Payment =>
  ({ id, ts: `${day}T12:00:00.000Z`, amount, brand, last4: '4242', buyerId: `b-${id}` });
const dispute = (id: string, paymentId: string, day: string, amount: number, status: Dispute['status'], brand: Brand = 'visa'): Dispute =>
  ({ id, paymentId, filedTs: `${day}T09:00:00.000Z`, amount, brand, reason: 'fraudulent', status });
const many = (prefix: string, day: string, n: number, amount: number, brand: Brand = 'visa') =>
  Array.from({ length: n }, (_, i) => pay(`${prefix}${i}`, day, amount, brand));

function fixture(): Input {
  const june = [...many('j', '2026-06-10', 9, 9700), pay('jbig', '2026-06-10', 49740)];
  const payments = [...june, ...many('s', '2026-09-15', 10, 9700), ...many('o', '2026-10-20', 20, 9700)];
  const disputes = [
    dispute('d1', 'j0', '2026-07-01', 9700, 'lost'),
    dispute('d2', 'jbig', '2026-07-05', 49740, 'open'),
    dispute('d3', 'o0', '2026-11-01', 9700, 'open'),
  ];
  const refunds: Refund[] = [{ id: 'r1', paymentId: 's0', ts: '2026-09-20T00:00:00.000Z', amount: 9700 }];
  return { asOf: '2026-11-08', payments, disputes, refunds };
}

describe('disputeStats', () => {
  const s = disputeStats(fixture(), RULES_V1);

  it('splits judged and immature months', () => {
    expect(s.judgedMonths).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(s.immatureMonths).toEqual(['2026-09', '2026-10']);
    expect(s.byMonth.map(m => m.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    const jul = s.byMonth[1]!;
    expect(jul.payments).toBe(0);
    expect(jul.rate).toBeNaN();
    expect(jul.filedDisputes).toBe(2);
  });

  it('computes judged figures', () => {
    expect(s.judgedPayments).toBe(10);
    expect(s.judgedDisputes).toBe(2);
    expect(s.judgedRate).toBe(0.2);
    expect(s.outcomesJudged).toEqual({ won: 0, lost: 1, open: 1, winRate: 0 });
    expect(s.avgJudgedDisputeAmount).toBe(29700);
    expect(s.immaturePayments).toBe(30);
    expect(s.reasonsJudged.fraudulent).toBe(2);
  });

  it('computes the 30-day window and growth', () => {
    expect(s.payments30d).toBe(20);
    expect(s.disputes30d).toBe(1);
    expect(s.rate30d).toBe(0.05);
    expect(s.last30Sales).toBe(20 * 9700);
    expect(s.growth).toBe(2);
  });

  it('computes refunds and open disputes', () => {
    expect(s.refundRate).toBe(1 / 40);
    expect(s.openCount).toBe(2);
    expect(s.openAmount).toBe(49740 + 9700);
  });

  it('orders brand rows visa, mastercard, amex, discover', () => {
    expect(s.byBrandJudged.map(b => b.brand)).toEqual(['visa', 'mastercard', 'amex', 'discover']);
    expect(brandGroup('amex')).toBe('other');
    expect(brandGroup('discover')).toBe('other');
    expect(brandGroup('visa')).toBe('visa');
  });

  it.each(['Asia/Kolkata', 'America/Los_Angeles'])('gives the UTC result in %s', tz => {
    const before = process.env.TZ;
    process.env.TZ = tz;
    try {
      expect(disputeStats(fixture(), RULES_V1)).toEqual(s);
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });
});

describe('tiny samples', () => {
  it('leaves rates NaN for brands with no payments and ignores small brands in worstBrandRate', () => {
    const s = disputeStats(fixture(), RULES_V1);
    expect(s.byBrandJudged.find(b => b.brand === 'amex')!.rate).toBeNaN();
    expect(worstBrandRate(s, RULES_V1)).toBeNull();
  });

  it('picks the higher of visa and mastercard with enough judged payments', () => {
    const payments = [...many('v', '2026-06-10', 40, 9700, 'visa'), ...many('m', '2026-06-11', 40, 9700, 'mastercard'), ...many('a', '2026-06-12', 40, 9700, 'amex')];
    const disputes = [
      dispute('d1', 'v0', '2026-06-20', 9700, 'lost'),
      dispute('d2', 'm0', '2026-06-20', 9700, 'lost', 'mastercard'),
      dispute('d3', 'm1', '2026-06-21', 9700, 'lost', 'mastercard'),
      dispute('d4', 'a0', '2026-06-21', 9700, 'lost', 'amex'),
      dispute('d5', 'a1', '2026-06-22', 9700, 'lost', 'amex'),
      dispute('d6', 'a2', '2026-06-23', 9700, 'lost', 'amex'),
    ];
    const s = disputeStats({ asOf: '2026-11-08', payments, disputes, refunds: [] }, RULES_V1);
    expect(worstBrandRate(s, RULES_V1)).toEqual({ brand: 'mastercard', rate: 2 / 40 });
  });

  it('handles zero disputes without throwing', () => {
    const s = disputeStats({ asOf: '2026-11-08', payments: [...many('p', '2026-06-10', 10, 9700), ...many('q', '2026-10-20', 10, 9700)], disputes: [], refunds: [] }, RULES_V1);
    expect(s.judgedRate).toBe(0);
    expect(s.rate30d).toBe(0);
    expect(s.byBrandJudged.find(b => b.brand === 'visa')!.rate).toBe(0);
    expect(s.avgJudgedDisputeAmount).toBe(0);
    expect(s.outcomesJudged.winRate).toBeNaN();
  });
});

describe('UTC month attribution near midnight', () => {
  const edge = (): Input => ({
    asOf: '2026-11-08',
    payments: [
      { id: 'late', ts: '2026-06-30T23:30:00.000Z', amount: 9700, brand: 'visa', last4: '4242', buyerId: 'b1' },
      { id: 'early', ts: '2026-07-01T00:30:00.000Z', amount: 9700, brand: 'visa', last4: '4242', buyerId: 'b2' },
    ],
    disputes: [{ id: 'd1', paymentId: 'late', filedTs: '2026-07-01T00:30:00.000Z', amount: 9700, reason: 'fraudulent', status: 'lost', brand: 'visa' }],
    refunds: [],
  });
  const check = (s: ReturnType<typeof disputeStats>) => {
    const [jun, jul] = s.byMonth;
    expect([jun!.month, jun!.payments, jun!.disputes, jun!.filedDisputes]).toEqual(['2026-06', 1, 1, 0]);
    expect([jul!.month, jul!.payments, jul!.disputes, jul!.filedDisputes]).toEqual(['2026-07', 1, 0, 1]);
  };

  it.each(['UTC', 'Asia/Kolkata', 'America/Los_Angeles'])('attributes by UTC month in %s', tz => {
    const before = process.env.TZ;
    process.env.TZ = tz;
    try {
      check(disputeStats(edge(), RULES_V1));
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });
});

describe('boundaries', () => {
  const at = (id: string, ts: string): Payment => ({ id, ts, amount: 9700, brand: 'visa', last4: '4242', buyerId: id });

  it('uses (asOf - 30d, asOf] for payments', () => {
    const payments = [
      at('out', '2026-10-09T23:59:59.999Z'),
      at('in1', '2026-10-10T00:00:00.000Z'),
      at('in2', '2026-11-08T23:59:59.999Z'),
      at('after', '2026-11-09T00:00:00.000Z'),
    ];
    const s = disputeStats({ asOf: '2026-11-08', payments, disputes: [], refunds: [] }, RULES_V1);
    expect(s.payments30d).toBe(2);
    expect(s.last30Sales).toBe(2 * 9700);
  });

  it('uses (asOf - 30d, asOf] for disputes by filedTs', () => {
    const payments = [at('p', '2026-06-10T12:00:00.000Z')];
    const filed = (id: string, ts: string): Dispute => ({ id, paymentId: 'p', filedTs: ts, amount: 9700, brand: 'visa', reason: 'fraudulent', status: 'open' });
    const disputes = [
      filed('out', '2026-10-09T23:59:59.999Z'),
      filed('in1', '2026-10-10T00:00:00.000Z'),
      filed('in2', '2026-11-08T23:59:59.999Z'),
      filed('after', '2026-11-09T00:00:00.000Z'),
    ];
    const s = disputeStats({ asOf: '2026-11-08', payments, disputes, refunds: [] }, RULES_V1);
    expect(s.disputes30d).toBe(2);
  });

  it('judges a month ending exactly asOf - 60 days, not one ending a day later', () => {
    const payments = [at('jun', '2026-06-15T12:00:00.000Z'), at('jul', '2026-07-15T12:00:00.000Z')];
    // June ends 06-30 = 2026-08-29 - 60 days
    const exact = disputeStats({ asOf: '2026-08-29', payments, disputes: [], refunds: [] }, RULES_V1);
    expect(exact.judgedMonths).toEqual(['2026-06']);
    expect(exact.immatureMonths).toEqual(['2026-07']);
    const dayEarly = disputeStats({ asOf: '2026-08-28', payments, disputes: [], refunds: [] }, RULES_V1);
    expect(dayEarly.judgedMonths).toEqual([]);
    expect(dayEarly.immatureMonths).toEqual(['2026-06', '2026-07']);
  });
});
