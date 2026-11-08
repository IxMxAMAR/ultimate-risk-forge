import { addDays, isWithin, monthEnd, monthKey } from '../lib/dates';
import { safeRate, type Cents } from '../lib/money';
import type { Brand, DisputeReason, ForgedCase } from '../domain/types';
import type { Ruleset } from '../domain/ruleset';

export interface MonthRow { month: string; payments: number; disputes: number; rate: number; judged: boolean; filedDisputes: number; filedRate: number }
export interface BrandRow { brand: Brand; payments: number; disputes: number; rate: number }
export interface DisputeStats {
  rate30d: number; disputes30d: number; payments30d: number;
  byMonth: MonthRow[];
  judgedMonths: string[]; immatureMonths: string[];
  judgedRate: number; judgedPayments: number; judgedDisputes: number;
  byBrandJudged: BrandRow[];
  refundRate: number;
  reasonsJudged: Record<DisputeReason, number>;
  outcomesJudged: { won: number; lost: number; open: number; winRate: number };
  growth: number;
  openCount: number; openAmount: Cents;
  avgJudgedDisputeAmount: Cents;
  immaturePayments: number;
  last30Sales: Cents;
}

const BRANDS: Brand[] = ['visa', 'mastercard', 'amex', 'discover'];

export const brandGroup = (b: Brand): 'visa' | 'mastercard' | 'other' => (b === 'amex' || b === 'discover' ? 'other' : b);

function monthsBefore(asOf: string, first: string): string[] {
  const out: string[] = [];
  const end = monthKey(asOf);
  let y = Number(first.slice(0, 4));
  let m = Number(first.slice(5, 7));
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (key >= end) return out;
    out.push(key);
    if (++m > 12) { m = 1; y++; }
  }
}

export function disputeStats(c: Pick<ForgedCase, 'asOf' | 'payments' | 'disputes' | 'refunds'>, rules: Ruleset): DisputeStats {
  const { asOf, payments, disputes, refunds } = c;
  const from30 = addDays(asOf, -rules.windowDays);
  const judgedCutoff = addDays(asOf, -rules.judgedAfterDays);
  const paymentById = new Map(payments.map(p => [p.id, p]));

  const paidIn = new Map<string, number>();
  const disputedIn = new Map<string, number>();
  const filedIn = new Map<string, number>();
  for (const p of payments) paidIn.set(monthKey(p.ts), (paidIn.get(monthKey(p.ts)) ?? 0) + 1);
  for (const d of disputes) {
    const p = paymentById.get(d.paymentId);
    if (p) disputedIn.set(monthKey(p.ts), (disputedIn.get(monthKey(p.ts)) ?? 0) + 1);
    filedIn.set(monthKey(d.filedTs), (filedIn.get(monthKey(d.filedTs)) ?? 0) + 1);
  }

  const first = payments.reduce((min, p) => (p.ts < min ? p.ts : min), payments[0]?.ts ?? asOf);
  const byMonth: MonthRow[] = monthsBefore(asOf, monthKey(first)).map(month => {
    const n = paidIn.get(month) ?? 0;
    const disputed = disputedIn.get(month) ?? 0;
    const filed = filedIn.get(month) ?? 0;
    return { month, payments: n, disputes: disputed, rate: safeRate(disputed, n), judged: monthEnd(month) <= judgedCutoff, filedDisputes: filed, filedRate: safeRate(filed, n) };
  });
  const judgedMonths = byMonth.filter(m => m.judged).map(m => m.month);
  const immatureMonths = byMonth.filter(m => !m.judged).map(m => m.month);
  const isJudged = (ts: string) => judgedMonths.includes(monthKey(ts));

  const in30 = (ts: string) => isWithin(ts.slice(0, 10), from30, asOf);
  const sales30 = payments.filter(p => in30(p.ts));
  const disputes30d = disputes.filter(d => in30(d.filedTs)).length;

  const judgedPays = payments.filter(p => isJudged(p.ts));
  const judgedDisps = disputes.filter(d => { const p = paymentById.get(d.paymentId); return p !== undefined && isJudged(p.ts); });

  const byBrandJudged: BrandRow[] = BRANDS.map(brand => {
    const n = judgedPays.filter(p => p.brand === brand).length;
    const k = judgedDisps.filter(d => paymentById.get(d.paymentId)!.brand === brand).length;
    return { brand, payments: n, disputes: k, rate: safeRate(k, n) };
  });

  const reasonsJudged: Record<DisputeReason, number> = { fraudulent: 0, not_received: 0, subscription_canceled: 0, product_unacceptable: 0, credit_not_processed: 0 };
  for (const d of judgedDisps) reasonsJudged[d.reason]++;
  const won = judgedDisps.filter(d => d.status === 'won').length;
  const lost = judgedDisps.filter(d => d.status === 'lost').length;
  const open = judgedDisps.filter(d => d.status === 'open').length;

  const lastFull = byMonth[byMonth.length - 1];
  const before = byMonth[byMonth.length - 2];
  const openDisputes = disputes.filter(d => d.status === 'open');
  const judgedTotal = judgedDisps.reduce((sum, d) => sum + d.amount, 0);

  return {
    rate30d: safeRate(disputes30d, sales30.length), disputes30d, payments30d: sales30.length,
    byMonth, judgedMonths, immatureMonths,
    judgedRate: safeRate(judgedDisps.length, judgedPays.length), judgedPayments: judgedPays.length, judgedDisputes: judgedDisps.length,
    byBrandJudged,
    refundRate: safeRate(refunds.length, payments.length),
    reasonsJudged,
    outcomesJudged: { won, lost, open, winRate: safeRate(won, won + lost) },
    growth: safeRate(lastFull?.payments ?? 0, before?.payments ?? 0),
    openCount: openDisputes.length, openAmount: openDisputes.reduce((sum, d) => sum + d.amount, 0),
    avgJudgedDisputeAmount: judgedDisps.length === 0 ? 0 : Math.round(judgedTotal / judgedDisps.length / 100) * 100,
    immaturePayments: payments.length - judgedPays.length,
    last30Sales: sales30.reduce((sum, p) => sum + p.amount, 0),
  };
}

export function worstBrandRate(s: DisputeStats, rules: Ruleset): { brand: Brand; rate: number } | null {
  let worst: { brand: Brand; rate: number } | null = null;
  for (const row of s.byBrandJudged) {
    if ((row.brand !== 'visa' && row.brand !== 'mastercard') || row.payments < rules.minBrandPayments) continue;
    if (worst === null || row.rate > worst.rate) worst = { brand: row.brand, rate: row.rate };
  }
  return worst;
}
