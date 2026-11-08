import { addDays } from '../lib/dates';
import { pct } from '../lib/money';
import type { Ruleset } from '../domain/ruleset';
import type { Brand, FlagKind, Flag, ForgedCase, Severity } from '../domain/types';
import type { DisputeStats } from './disputeMath';

export const FLAG_ORDER: FlagKind[] = ['rate-hidden-by-growth', 'mc-over-limit', 'visa-over-limit', 'refunds-low-disputes-high', 'young-account-fast-growth'];
const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium'];

export function escalate(base: Severity, value: number, threshold: number, rules: Ruleset): Severity {
  if (!(value >= threshold * rules.escalateAt)) return base;
  return base === 'medium' ? 'high' : 'critical';
}

const times = (n: number): string => `${Number(n.toFixed(1))}×`;

function brandRow(s: DisputeStats, brand: Brand, rules: Ruleset) {
  const row = s.byBrandJudged.find(r => r.brand === brand);
  return row && row.payments >= rules.minBrandPayments ? row : undefined;
}

export function runChecks(c: ForgedCase, s: DisputeStats, rules: Ruleset): Flag[] {
  const flags: Flag[] = [];
  const raise = (kind: FlagKind, severity: Severity, title: string, why: string, ids: string[]) => {
    const capped = c.groundTruth.lookAlikes.includes(kind) ? 'medium' : severity;
    flags.push({ id: kind, kind, severity: capped, title, why, evidence: { tab: 'disputes', ids }, state: 'raised', note: '', addedBy: 'rules' });
  };

  if (s.growth >= rules.growthMin && s.judgedRate >= rules.hiddenRatioMin * s.rate30d && s.judgedRate >= rules.limits.visa) {
    raise('rate-hidden-by-growth', 'critical', 'Dispute rate hidden by growth',
      `Why it matters: ${times(s.growth)} more sales last month means most payments haven't had time to be disputed. The real rate is ${pct(s.judgedRate)}, not ${pct(s.rate30d)}.`,
      s.judgedMonths.map(m => `month:${m}`));
  }

  const mc = brandRow(s, 'mastercard', rules);
  if (mc && mc.rate >= rules.limits.mcEcm) {
    raise('mc-over-limit', escalate('high', mc.rate, rules.limits.mcEcm, rules),
      mc.rate >= rules.limits.mcHecm ? `Mastercard ${pct(mc.rate)}, over the excessive tier` : `Mastercard ${pct(mc.rate)}, over the 1.5% line`,
      'Why it matters: Mastercard fines sellers over its limits, and fines grow every month the seller stays over.', ['brand:mastercard']);
  }

  const visa = brandRow(s, 'visa', rules);
  if (visa && visa.rate >= rules.limits.visa) {
    raise('visa-over-limit', escalate('high', visa.rate, rules.limits.visa, rules), `Visa ${pct(visa.rate)}, over the 1.5% line`,
      'Why it matters: Visa fines sellers who stay over its line. The platform is responsible for keeping every seller under it.', ['brand:visa']);
  }

  if (s.refundRate < rules.refundsLowRatio * s.judgedRate && s.judgedRate >= rules.refundsLowMinRate) {
    raise('refunds-low-disputes-high', 'medium', `Refunds low (${pct(s.refundRate)}), disputes high`,
      `Why it matters: unhappy buyers go to their bank instead of the seller — ${s.reasonsJudged.fraudulent} of ${s.judgedDisputes} disputes say “fraudulent”.`,
      ['kpi:refund-rate', 'reasons']);
  }

  if (c.subject.accountAgeMonths <= rules.youngAccountMonths && s.growth >= rules.growthMin) {
    raise('young-account-fast-growth', 'medium', `${c.subject.accountAgeMonths}-month-old account growing ${times(s.growth)} in a month`,
      'Why it matters: new accounts that grow very fast are where sudden losses usually come from.', ['kpi:account-age']);
  }

  return flags.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || FLAG_ORDER.indexOf(a.kind as FlagKind) - FLAG_ORDER.indexOf(b.kind as FlagKind));
}

export function reviewDateFrom(asOf: string): string {
  const d = addDays(asOf, 30);
  if (Number(d.slice(8, 10)) <= 15) return `${d.slice(0, 8)}15`;
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7));
  return m === 12 ? `${y + 1}-01-15` : `${y}-${String(m + 1).padStart(2, '0')}-15`;
}
