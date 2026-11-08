import { formatDay, monthLabel } from '../lib/dates';
import { formatMoney, pct } from '../lib/money';
import { reasonLabel } from '../domain/labels';
import type { Decision, DisputeReason } from '../domain/types';
import { worstBrandRate } from '../checks/disputeMath';
import type { Ruleset } from '../domain/ruleset';
import type { CaseView } from '../app/derive';

export const FIX_TEXT = 'The dispute rate shown first, to sellers and to reviewers, is the last-30-day number. For any account that grows more than 3× in a month, that number is misleading. Proposed rule: show the by-month-of-purchase rate first whenever growth is above 3×.';

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function monthSpan(months: string[]): string {
  const first = months[0] ?? '';
  const last = months[months.length - 1] ?? '';
  return first === last ? monthLabel(first) : `${monthLabel(first)}–${monthLabel(last)}`;
}

function topReason(v: CaseView): DisputeReason {
  let top: DisputeReason = 'fraudulent';
  let best = -1;
  for (const [reason, n] of Object.entries(v.stats.reasonsJudged) as [DisputeReason, number][]) {
    if (n > best) { top = reason; best = n; }
  }
  return top;
}

export function howEstimated(v: CaseView, rules: Ruleset): string {
  const brand = worstBrandRate(v.stats, rules);
  const high = brand ? `the ${capitalise(brand.brand)} rate` : 'the judged-sales rate';
  const fines = v.exposure.rows.some(r => r.key === 'fines') ? " Fines follow Mastercard's published monthly ladder." : '';
  return `The low case uses the judged-sales rate (${pct(v.exposure.lowRate)}), the high case uses ${high} (${pct(v.exposure.highRate)}). The ${formatMoney(v.stats.avgJudgedDisputeAmount)} average comes from the ${v.stats.judgedDisputes} judged disputes.${fines}`;
}

export function conditions(v: CaseView): string[] {
  const reason = topReason(v);
  return [
    `Disputes on ${monthSpan(v.stats.immatureMonths)} sales stay under 1.5% for both Visa and Mastercard once those sales are old enough to judge.`,
    reason === 'fraudulent'
      ? 'The seller turns on 3D Secure (extra card checks). Most disputes are marked fraudulent, so this is the biggest single fix.'
      : `The seller fixes the top dispute reason: ${reasonLabel(reason)}.`,
    `The ${v.stats.openCount} open disputes are settled and the balance stays positive.`,
  ];
}

export const fallback = (reviewDate: string): string =>
  `If these aren't met by ${formatDay(reviewDate)}: keep the hold 30 more days. If Mastercard is still over 3.0%, pause Mastercard at checkout for this seller.`;

export function letter(v: CaseView, d: Decision, rules: Ruleset): string {
  const { forged, stats } = v;
  const held = formatMoney(forged.trigger.heldAmount);
  const intro = `We reviewed your request to release your ${held} hold.`;
  const middle = d.release === forged.trigger.heldAmount
    ? `${intro} We're releasing all of it, ${held} today.`
    : d.keep === forged.trigger.heldAmount
      ? `${intro} We can't release any of it yet, so we're keeping the full ${held} for now.`
      : `${intro} We're releasing ${formatMoney(d.release)} today and keeping ${formatMoney(d.keep)} for now.`;
  const brand = worstBrandRate(stats, rules);
  const why = d.action === 'approve'
    ? "Why: your dispute rates are within the card networks' limits."
    : `Why: on your ${monthSpan(stats.judgedMonths)} sales, ${pct(stats.judgedRate)} of payments were disputed${brand ? ` (${pct(brand.rate)} on ${capitalise(brand.brand)})` : ''}. That's above the card networks' limits.${topReason(v) === 'fraudulent' ? ' Most disputes are marked "fraudulent", so turning on 3D Secure under Settings → Risk should bring that down quickly.' : ''}`;
  const next = d.action === 'approve' ? '— Risk Operations' : `We'll look again on ${formatDay(d.reviewDate)}. — Risk Operations`;
  return [`Hi ${forged.subject.name.split(' ')[0]} team,`, middle, why, next].filter(Boolean).join('\n\n');
}
