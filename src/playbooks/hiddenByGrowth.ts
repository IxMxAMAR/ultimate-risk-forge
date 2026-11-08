import type { CaseView } from '../app/derive';
import { holdToKeep } from '../checks/exposure';
import { reviewDateFrom } from '../checks/flags';
import type { Suggestion } from '../checks/suggest';
import { RULES_V1, type Ruleset } from '../domain/ruleset';
import { monthLabel } from '../lib/dates';
import { formatMoney, pct } from '../lib/money';
import type { Answer, Playbook, PlaybookAnswers, Step } from './types';

const times = (n: number): string => `${Number(n.toFixed(1))}×`;
const brandRow = (v: CaseView, brand: 'visa' | 'mastercard') => v.stats.byBrandJudged.find(r => r.brand === brand);
const enough = (v: CaseView, brand: 'visa' | 'mastercard') => {
  const row = brandRow(v, brand);
  return row !== undefined && row.payments >= RULES_V1.minBrandPayments ? row : undefined;
};
const brandDetail = (v: CaseView, brand: 'visa' | 'mastercard') => {
  const row = brandRow(v, brand);
  return row ? `${row.payments.toLocaleString('en-US')} judged payments, ${pct(row.rate)}` : '';
};
const jumped = (_v: CaseView, a: PlaybookAnswers) => !a.jump || a.jump[0] === 'yes';
const yesNo = (yes: Answer): Answer[] => [yes, { id: 'no', label: 'No', detail: '' }];

const jump: Step = {
  id: 'jump', title: 'Sales jump', question: 'Did sales jump recently?',
  why: "Fast growth makes recent sales look clean because they haven't had time to be disputed.",
  lookAt: v => [{ label: `Growth ${times(v.stats.growth)}`, tab: 'disputes', ids: ['kpi:account-age'] }],
  answers: v => yesNo({ id: 'yes', label: `Yes — ${times(v.stats.growth)} last month`, detail: '' }),
  expected: v => [v.stats.growth >= RULES_V1.growthMin ? 'yes' : 'no'],
};

const hidden: Step = {
  id: 'hidden', title: 'Hidden rate', question: 'Is the rate on older sales at least double the 30-day rate?',
  why: "New sales haven't had time to be disputed. Judge the seller on sales at least 60 days old.",
  lookAt: v => {
    const months = v.stats.judgedMonths;
    return [
      { label: `30-day ${pct(v.stats.rate30d)}`, tab: 'disputes', ids: ['kpi:rate-30d'] },
      { label: `Judged sales ${pct(v.stats.judgedRate)}`, tab: 'disputes', ids: ['kpi:rate-judged'] },
      { label: `Chart · ${monthLabel(months[0] ?? '')}–${monthLabel(months[months.length - 1] ?? '')}`, tab: 'disputes', ids: months.map(m => `month:${m}`) },
    ];
  },
  answers: v => yesNo({ id: 'yes', label: 'Yes', detail: `${pct(v.stats.judgedRate)} on older sales vs ${pct(v.stats.rate30d)} in 30 days`, sets: { 'rate-hidden-by-growth': 'confirmed' } }),
  when: jumped,
  expected: v => [v.stats.judgedRate >= RULES_V1.hiddenRatioMin * v.stats.rate30d && v.stats.judgedRate >= RULES_V1.limits.visa ? 'yes' : 'no'],
};

const brands: Step = {
  id: 'brands', title: 'Card brands', question: 'Is any card brand over its network line?', multi: true,
  why: 'Each card network fines sellers who stay over its line.',
  lookAt: () => [{ label: 'Brand table', tab: 'disputes', ids: ['brand:visa', 'brand:mastercard'] }],
  answers: v => [
    { id: 'mc3', label: 'Mastercard 3%+', detail: brandDetail(v, 'mastercard'), sets: { 'mc-over-limit': 'confirmed' } },
    { id: 'mc15', label: 'Mastercard 1.5–3%', detail: brandDetail(v, 'mastercard'), sets: { 'mc-over-limit': 'confirmed' } },
    { id: 'visa', label: 'Visa 1.5%+', detail: brandDetail(v, 'visa'), sets: { 'visa-over-limit': 'confirmed' } },
    { id: 'none', label: 'None', detail: '', exclusive: true },
    { id: 'thin', label: 'Not enough data', detail: `Under ${RULES_V1.minBrandPayments} judged payments on each brand`, exclusive: true, neutral: true },
  ],
  expected: v => {
    const mc = enough(v, 'mastercard');
    const visa = enough(v, 'visa');
    if (!mc && !visa) return ['thin'];
    const out: string[] = [];
    if (mc && mc.rate >= RULES_V1.limits.mcHecm) out.push('mc3');
    else if (mc && mc.rate >= RULES_V1.limits.mcEcm) out.push('mc15');
    if (visa && visa.rate >= RULES_V1.limits.visa) out.push('visa');
    return out.length ? out : ['none'];
  },
};

const refunds: Step = {
  id: 'refunds', title: 'Refunds', question: 'Are buyers going to their bank instead of asking for refunds?',
  why: 'When unhappy buyers go to their bank instead of the seller, disputes rise and refunds stay low.',
  lookAt: v => [
    { label: `Refund rate ${pct(v.stats.refundRate)}`, tab: 'disputes', ids: ['kpi:refund-rate'] },
    { label: 'Dispute reasons', tab: 'disputes', ids: ['reasons'] },
  ],
  answers: v => yesNo({ id: 'yes', label: 'Yes', detail: `Refunds ${pct(v.stats.refundRate)} vs disputes ${pct(v.stats.judgedRate)}`, sets: { 'refunds-low-disputes-high': 'confirmed' } }),
  expected: v => [v.stats.refundRate < RULES_V1.refundsLowRatio * v.stats.judgedRate && v.stats.judgedRate >= RULES_V1.refundsLowMinRate ? 'yes' : 'no'],
};

const explained: Step = {
  id: 'explained', title: 'Growth explained?', question: 'Is the growth explained?',
  why: 'New accounts that grow very fast are where sudden losses usually come from — unless the growth has a documented cause.',
  lookAt: v => [
    { label: `Account age ${v.forged.subject.accountAgeMonths} mo`, tab: 'disputes', ids: ['kpi:account-age'] },
    ...v.forged.docs.map(d => ({ label: d.title, tab: 'disputes' as const, ids: [`doc:${d.kind}`] })),
  ],
  answers: v => [
    { id: 'documented', label: 'Yes — documented', detail: v.forged.docs.map(d => d.title).join(', ') },
    { id: 'no', label: 'No', detail: `${v.forged.subject.accountAgeMonths}-month-old account, ${times(v.stats.growth)} growth`, sets: { 'young-account-fast-growth': 'confirmed' } },
  ],
  when: jumped,
  expected: v => [v.forged.docs.some(d => d.kind === 'ad-campaign-receipts') ? 'documented' : 'no'],
};

const heldVsKeep = (v: CaseView): string =>
  `Held ${formatMoney(v.forged.trigger.heldAmount)} vs ${formatMoney(holdToKeep(v.exposure.high, RULES_V1))} to keep (worst case ${formatMoney(v.exposure.high)} + buffer)`;

const money: Step = {
  id: 'money', title: 'Money', question: 'Does the hold cover the money at risk?',
  why: 'The hold should cover what could still be lost: open disputes, disputes still to come, fees and fines.',
  lookAt: v => [{ label: heldVsKeep(v), tab: 'disputes', ids: ['decision-hold'] }],
  answers: v => {
    const detail = heldVsKeep(v);
    return [{ id: 'covers', label: 'Covers it', detail }, { id: 'short', label: 'Falls short', detail }];
  },
  expected: v => [v.forged.trigger.heldAmount > holdToKeep(v.exposure.high, RULES_V1) ? 'covers' : 'short'],
};

function ending(v: Omit<CaseView, 'suggestion'>, rules: Ruleset): Suggestion {
  const held = v.forged.trigger.heldAmount;
  const asOf = v.forged.asOf;
  const risk = v.flags.some(f => f.state === 'confirmed' && (f.severity === 'critical' || f.severity === 'high'));
  if (!risk) return { action: 'approve', keep: 0, release: held, reviewDate: asOf, basis: 'No confirmed critical or high flags', summary: `Release all ${formatMoney(held)}` };
  const keep = holdToKeep(v.exposure.high, rules);
  if (held > keep) {
    return { action: 'partial-release', keep, release: held - keep, reviewDate: reviewDateFrom(asOf), basis: 'Confirmed risk; the hold is more than the worst case', summary: `Partial release, keep ${formatMoney(keep)}` };
  }
  return { action: 'deny', keep: held, release: 0, reviewDate: reviewDateFrom(asOf), basis: 'Confirmed risk; the hold does not cover the worst case plus buffer', summary: `Deny, keep all ${formatMoney(held)}` };
}

// Six questions walk the five checks to a decision (ARCHITECTURE.md §5).
export const HIDDEN_BY_GROWTH: Playbook = {
  id: 'hidden-by-growth', version: '1.1', caseType: 'hidden-by-growth', title: 'Early hold release',
  steps: [jump, hidden, brands, refunds, explained, money], ending,
};
