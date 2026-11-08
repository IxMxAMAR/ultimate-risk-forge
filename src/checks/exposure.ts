import { monthLabel } from '../lib/dates';
import { ceilTo, formatMoney, pct, type Cents } from '../lib/money';
import type { Ruleset } from '../domain/ruleset';
import { worstBrandRate, type DisputeStats } from './disputeMath';

export interface ExposureRow { key: 'open' | 'new' | 'fees' | 'fines'; label: string; detail?: string; low: Cents; high: Cents }
export interface Exposure { rows: ExposureRow[]; low: Cents; high: Cents; expectedLow: number; expectedHigh: number; lowRate: number; highRate: number }

export function networkFines(s: DisputeStats, rules: Ruleset): { low: Cents; high: Cents; tier: 'none' | 'ecm' | 'hecm' } {
  const mc = s.byBrandJudged.find(r => r.brand === 'mastercard');
  if (!mc || mc.payments < rules.minBrandPayments) return { low: 0, high: 0, tier: 'none' };
  const tier = mc.rate >= rules.limits.mcHecm ? 'hecm' : mc.rate >= rules.limits.mcEcm ? 'ecm' : 'none';
  if (tier === 'none') return { low: 0, high: 0, tier };
  const ladder = rules.mcFines[tier];
  return { low: ladder[1], high: ladder[1] + ladder[2], tier };
}

export function exposure(s: DisputeStats, rules: Ruleset): Exposure {
  const lowRate = s.judgedRate;
  const highRate = Math.max(lowRate, worstBrandRate(s, rules)?.rate ?? lowRate);
  const expectedLow = Math.round(s.immaturePayments * lowRate);
  const expectedHigh = Math.round(s.immaturePayments * highRate);
  const first = s.immatureMonths[0] ?? '';
  const last = s.immatureMonths[s.immatureMonths.length - 1] ?? '';
  const fines = networkFines(s, rules);

  const rows: ExposureRow[] = [
    { key: 'open', label: `${s.openCount} disputes still open`, low: s.openAmount, high: s.openAmount },
    {
      key: 'new',
      label: `New disputes on ${monthLabel(first)}–${monthLabel(last)} sales`,
      detail: `${s.immaturePayments} payments × ${pct(lowRate)}–${pct(highRate)} ≈ ${expectedLow}–${expectedHigh} disputes × ${formatMoney(s.avgJudgedDisputeAmount)} average`,
      low: expectedLow * s.avgJudgedDisputeAmount, high: expectedHigh * s.avgJudgedDisputeAmount,
    },
    { key: 'fees', label: 'Dispute fees', detail: '(assumed $15 each)', low: expectedLow * rules.disputeFeeAssumed, high: expectedHigh * rules.disputeFeeAssumed },
  ];
  if (fines.tier !== 'none') rows.push({ key: 'fines', label: 'Mastercard fines', detail: '(months 2–3)', low: fines.low, high: fines.high });

  return {
    rows,
    low: rows.reduce((sum, r) => sum + r.low, 0), high: rows.reduce((sum, r) => sum + r.high, 0),
    expectedLow, expectedHigh, lowRate, highRate,
  };
}

export const holdToKeep = (worst: Cents, rules: Ruleset): Cents => ceilTo(Math.ceil(worst * rules.holdBuffer), rules.holdRoundTo);

export const coverage = (keep: Cents, worst: Cents): { covers: boolean; bufferPct: number } =>
  ({ covers: keep >= worst, bufferPct: Math.round((keep / worst - 1) * 100) });
