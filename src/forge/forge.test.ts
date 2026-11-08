import { decodeCaseCode, displayIdFor } from '../domain/caseCode';
import type { ForgedCase } from '../domain/types';
import { forgeCase } from './forge';
import { STARTER_CODES } from './starters';

const digest = (c: ForgedCase) => {
  const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
  return {
    payments: { n: c.payments.length, sum: sum(c.payments), first: c.payments[0]!.id, last: c.payments.at(-1)!.id },
    disputes: { n: c.disputes.length, sum: sum(c.disputes), first: c.disputes[0]!.id, last: c.disputes.at(-1)!.id },
    refunds: { n: c.refunds.length, sum: sum(c.refunds), first: c.refunds[0]!.id, last: c.refunds.at(-1)!.id },
    hold: c.holds[0]!.amount,
    subject: c.subject.name,
    groundTruth: c.groundTruth,
  };
};

describe('forgeCase', () => {
  it('same code → identical case', () => {
    expect(forgeCase('PD-009R-HF')).toEqual(forgeCase('PD-009R-HF'));
  });

  it('generator output is frozen', () => {
    expect(digest(forgeCase('VT-G24B-KD'))).toMatchSnapshot();
  });

  it('starters decode to easy/normal/hard hidden-by-growth medium', () => {
    const specs = STARTER_CODES.map(decodeCaseCode);
    expect(specs.map((s) => s.difficulty)).toEqual(['easy', 'normal', 'hard']);
    for (const s of specs) {
      expect(s.type).toBe('hidden-by-growth');
      expect(s.size).toBe('medium');
    }
  });

  it('structural invariants', () => {
    for (const code of STARTER_CODES) {
      const c = forgeCase(code);
      const ids = new Set(c.payments.map((p) => p.id));
      const disputed = new Set(c.disputes.map((d) => d.paymentId));
      const amounts = [...c.payments, ...c.disputes, ...c.refunds].map((x) => x.amount).concat(c.holds[0]!.amount);
      expect(amounts.every(Number.isInteger)).toBe(true);
      expect(c.disputes.every((d) => ids.has(d.paymentId))).toBe(true);
      expect(c.disputes.every((d) => d.filedTs <= '2026-11-08T23:59:59.999Z')).toBe(true);
      expect(c.refunds.every((r) => r.ts <= '2026-11-08T23:59:59.999Z')).toBe(true);
      expect(c.payments.every((p) => p.ts >= '2026-06-01' && p.ts < '2026-11-01')).toBe(true);
      expect(c.refunds.some((r) => disputed.has(r.paymentId))).toBe(false);
      expect(c.holds[0]!.amount % 100000).toBe(0);
      expect(c.displayId).toBe(displayIdFor(c.spec.seed));
    }
  });

  it('growth matches difficulty', () => {
    const growth = STARTER_CODES.map((code) => {
      const c = forgeCase(code);
      const n = (m: string) => c.payments.filter((p) => p.ts.startsWith(m)).length;
      return Math.round(n('2026-10') / n('2026-09'));
    });
    expect(growth).toEqual([6, 5, 4]);
  });

  it('hard has the ad-campaign look-alike and easy/normal do not', () => {
    const [easy, normal, hard] = STARTER_CODES.map(forgeCase);
    expect(easy!.docs).toEqual([]);
    expect(normal!.docs).toEqual([]);
    expect(hard!.docs.map((d) => d.kind)).toEqual(['ad-campaign-receipts']);
    expect(hard!.groundTruth.lookAlikes).toEqual(['young-account-fast-growth']);
    expect(easy!.groundTruth.planted).toContain('young-account-fast-growth');
    expect(hard!.groundTruth.planted).not.toContain('young-account-fast-growth');
  });

  it('surprise is hidden and concrete', () => {
    const c = forgeCase('NS-0044-JR');
    expect(c.surprise).toBe(true);
    expect(c.actualType).toBe('hidden-by-growth');
  });

  it('unavailable types are refused', () => {
    expect(() => forgeCase('XK-G000-0P')).toThrow(/coming soon/);
  });
});
