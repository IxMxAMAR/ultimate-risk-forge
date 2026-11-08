import { CROCKFORD } from '../../lib/base32';
import { addDays, daysBetween, isWithin } from '../../lib/dates';
import { ceilTo, formatMoney, type Cents } from '../../lib/money';
import type { Rng } from '../../lib/rng';
import type { Brand, CaseSpec, Difficulty, Dispute, DisputeReason, EvidenceDoc, FlagKind, ForgedCase, Payment, Refund, SellerSize } from '../../domain/types';
import { RULES_V1 } from '../../domain/ruleset';
import { sellerName } from '../names';

const ASOF = '2026-11-08';
const ASOF_END = `${ASOF}T23:59:59.999Z`;
const MS_DAY = 86400000;
// Jun–Oct 2026, in order; index 0..2 are judged, 3..4 immature.
const MONTHS = [
  { month: 6, days: 30 },
  { month: 7, days: 31 },
  { month: 8, days: 31 },
  { month: 9, days: 30 },
  { month: 10, days: 31 },
] as const;
const BRANDS = [['visa', 0.54], ['mastercard', 0.33], ['amex', 0.08], ['discover', 0.05]] as const;
const PRICES = [[9700, 0.8], [49700, 0.17], [120000, 0.03]] as const;
const REASONS = [['fraudulent', 0.43], ['subscription_canceled', 0.29], ['product_unacceptable', 0.21], ['not_received', 0.07]] as const;
const OCT_PAYMENTS: Record<SellerSize, number> = { small: 300, medium: 2000, large: 20000 };

interface Tuning {
  growth: number;
  rates: { visa: number; mastercard: number; other: number };
  soFar: { sep: number; oct: number };
  ageMonths: number;
  adCampaign: boolean;
}
const TUNING: Record<Difficulty, Tuning> = {
  easy: { growth: 6, rates: { visa: 0.027, mastercard: 0.042, other: 0.025 }, soFar: { sep: 0.008, oct: 0.002 }, ageMonths: 3, adCampaign: false },
  normal: { growth: 5, rates: { visa: 0.018, mastercard: 0.031, other: 0.02 }, soFar: { sep: 0.006, oct: 0.0015 }, ageMonths: 4, adCampaign: false },
  hard: { growth: 4, rates: { visa: 0.016, mastercard: 0.0305, other: 0.012 }, soFar: { sep: 0.004, oct: 0.001 }, ageMonths: 5, adCampaign: true },
};

const AD_DOCS: EvidenceDoc[] = [{ kind: 'ad-campaign-receipts', title: 'Seller file · ad receipts (2)', note: 'The growth matches a paid ad campaign the seller documented (receipts on file).' }];

const group = (b: Brand): 'visa' | 'mastercard' | 'other' => (b === 'visa' || b === 'mastercard' ? b : 'other');

// Picks k distinct entries of pool, each with probability proportional to weight(entry).
function pickDistinct<T>(rng: Rng, pool: readonly T[], k: number, weight: (x: T) => number): T[] {
  const rest = [...pool];
  const out: T[] = [];
  for (let i = 0; i < k && rest.length > 0; i++) {
    const chosen = rng.weighted(rest.map((x) => [x, weight(x)] as const));
    out.push(chosen);
    rest.splice(rest.indexOf(chosen), 1);
  }
  return out;
}

const capped = (ms: number): string => new Date(Math.min(ms, Date.parse(ASOF_END))).toISOString();

// Generator rules: ARCHITECTURE.md §4.
export function generateHiddenByGrowth(spec: CaseSpec, rng: Rng): Omit<ForgedCase, 'code' | 'displayId' | 'spec' | 'actualType' | 'surprise'> {
  const t = TUNING[spec.difficulty];
  const oct = OCT_PAYMENTS[spec.size];
  const sep = Math.round(oct / t.growth);
  const counts = [Math.round(sep * 0.8), Math.round(sep * 0.85), Math.round(sep * 0.9), sep, oct];

  const payments: Payment[] = [];
  const monthOf: number[] = [];
  MONTHS.forEach(({ month, days }, mi) => {
    const rows = Array.from({ length: counts[mi]! }, () => {
      const day = rng.int(1, days);
      const ts = new Date(Date.UTC(2026, month - 1, day) + rng.int(0, MS_DAY - 1)).toISOString();
      const brand: Brand = rng.weighted(BRANDS);
      const amount: Cents = rng.weighted(PRICES);
      const last4 = String(rng.int(0, 9999)).padStart(4, '0');
      const buyerId = 'b-' + Array.from({ length: 6 }, () => CROCKFORD[rng.int(0, 31)]).join('');
      return { ts, brand, amount, last4, buyerId };
    });
    rows.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    for (const r of rows) {
      payments.push({ id: `p-${String(payments.length + 1).padStart(6, '0')}`, ...r });
      monthOf.push(mi);
    }
  });

  const disputes: Dispute[] = [];
  const disputed = new Set<string>();
  const fileDispute = (p: Payment, minDays: number, maxDays: number) => {
    const filedTs = capped(Date.parse(p.ts) + rng.int(minDays, maxDays) * MS_DAY);
    const reason: DisputeReason = rng.weighted(REASONS);
    const status = daysBetween(filedTs.slice(0, 10), ASOF) >= 45 ? (rng.chance(0.3) ? 'won' : 'lost') : 'open';
    disputes.push({ id: `d-${String(disputes.length + 1).padStart(4, '0')}`, paymentId: p.id, filedTs, amount: p.amount, brand: p.brand, reason, status });
    disputed.add(p.id);
  };
  const byPrice = (p: Payment) => p.amount;
  const judged = payments.filter((_, i) => monthOf[i]! <= 2);
  for (const g of ['visa', 'mastercard', 'other'] as const) {
    const pool = judged.filter((p) => group(p.brand) === g);
    // Visa and Mastercard always end up over the 1.5% line, even on small sellers where rounding would land under it.
    const count = Math.max(Math.round(pool.length * t.rates[g]), g === 'other' ? 0 : Math.floor(pool.length * RULES_V1.limits.visa) + 1);
    for (const p of pickDistinct(rng, pool, count, byPrice)) fileDispute(p, 20, 70);
  }
  for (const [mi, rate] of [[3, t.soFar.sep], [4, t.soFar.oct]] as const) {
    const pool = payments.filter((_, i) => monthOf[i] === mi);
    for (const p of pickDistinct(rng, pool, Math.round(pool.length * rate), byPrice)) fileDispute(p, 5, 40);
  }

  const refunds: Refund[] = [];
  const refundable = payments.filter((p) => !disputed.has(p.id));
  for (const p of pickDistinct(rng, refundable, Math.round(payments.length * 0.006), () => 1)) {
    refunds.push({ id: `r-${String(refunds.length + 1).padStart(4, '0')}`, paymentId: p.id, ts: capped(Date.parse(p.ts) + rng.int(1, 14) * MS_DAY), amount: p.amount });
  }

  const recent = payments.filter((p) => isWithin(p.ts.slice(0, 10), addDays(ASOF, -30), ASOF)).reduce((s, p) => s + p.amount, 0);
  const held = ceilTo(0.225 * recent, 100000);
  const { name, initials } = sellerName(rng);
  const planted: FlagKind[] = ['rate-hidden-by-growth', 'mc-over-limit', 'visa-over-limit', 'refunds-low-disputes-high'];
  if (!t.adCampaign) planted.push('young-account-fast-growth');

  return {
    asOf: ASOF,
    subject: { kind: 'seller', name, initials, accountAgeMonths: t.ageMonths },
    trigger: { kind: 'early-release', heldAmount: held },
    payments,
    disputes,
    refunds,
    holds: [{ kind: 'fixed', amount: held, releaseDate: addDays(ASOF, 60) }],
    docs: t.adCampaign ? AD_DOCS : [],
    story: `${name} has been selling for ${t.ageMonths} months and sales grew ${t.growth}× last month. They ask to release a ${formatMoney(held)} hold early.`,
    groundTruth: { planted, lookAlikes: t.adCampaign ? ['young-account-fast-growth'] : [], acceptable: ['deny', 'partial-release'], adjacent: ['hold-payouts', 'escalate'] },
    policyAffectedEstimate: rng.int(80, 200),
  };
}
