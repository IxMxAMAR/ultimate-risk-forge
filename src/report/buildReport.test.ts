import { describe, expect, it } from 'vitest';
import type { CaseView } from '../app/derive';
import { exposure } from '../checks/exposure';
import type { DisputeStats } from '../checks/disputeMath';
import { RULES_V1 } from '../domain/ruleset';
import type { Decision, Flag, ForgedCase } from '../domain/types';
import { deriveCase } from '../app/derive';
import { newCaseState } from '../persist/db';
import { buildReport, sellerMessage } from './buildReport';

const stats: DisputeStats = {
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
  reasonsJudged: { fraudulent: 15, not_received: 4, subscription_canceled: 2, product_unacceptable: 1, credit_not_processed: 1 },
  outcomesJudged: { won: 0, lost: 0, open: 0, winRate: NaN },
  growth: 5, openCount: 4, openAmount: 269100, avgJudgedDisputeAmount: 43000, immaturePayments: 1490, last30Sales: 0,
};

const flag = (id: string, state: Flag['state'], note = ''): Flag => ({
  id, kind: 'rate-hidden-by-growth', severity: 'critical', title: `Flag ${id}`, why: '', evidence: { tab: 'disputes', ids: [] }, state, note, addedBy: 'rules',
});

const forged = {
  displayId: 'RF-0003', actualType: 'hidden-by-growth', asOf: '2026-11-08',
  subject: { kind: 'seller', name: 'Brightline Studio', initials: 'BS', accountAgeMonths: 5 },
  trigger: { kind: 'early-release', heldAmount: 4200000 },
  disputes: new Array(27).fill(null), docs: [{ kind: 'ad-campaign-receipts', title: 'Ad receipts', note: '' }],
  policyAffectedEstimate: 12,
} as unknown as ForgedCase;

const e = exposure(stats, RULES_V1);
const suggestion = { action: 'deny', keep: 4200000, release: 0, reviewDate: '2026-12-15', basis: '', summary: 'Deny, keep all $42,000' } as const;
const view: CaseView = {
  forged, stats, ruleFlags: [], exposure: e, playbook: null, suggestion,
  flags: [flag('a', 'confirmed'), flag('b', 'confirmed'), flag('c', 'dismissed', 'Looks organic')],
};
const decision: Decision = { action: 'partial-release', keep: 2800000, release: 1400000, reviewDate: '2026-12-15' };
const cs = { ...newCaseState('CODE', true, '2026-11-08T10:00:00.000Z'), decision, overrideReason: 'Growth is real', decidedAt: '2026-11-08T14:09:00.000Z' };

describe('buildReport', () => {
  const r = buildReport(view, cs, 'A. Singh', RULES_V1);

  it('states the recommendation and the override', () => {
    expect(r.header.title).toBe('Brightline Studio — early hold release');
    expect(r.header.status).toBe('Decided');
    expect(r.recommendation.label).toBe('Partial release');
    expect(r.recommendation.release).toBe(1400000);
    expect(r.recommendation.confidence).toBe('high');
    expect(r.recommendation.override).toEqual({ suggested: 'Deny, keep all $42,000', reason: 'Growth is real' });
  });

  it('shows no override when the decision matches the suggestion, and a draft when undecided', () => {
    const same = buildReport(view, { ...cs, decision: { ...suggestion }, decidedAt: null }, 'A', RULES_V1);
    expect(same.recommendation.override).toBeNull();
    expect(same.header.status).toBe('Draft');
    expect(buildReport(view, { ...cs, decision: null }, 'A', RULES_V1).recommendation.label).toBe('Deny early release');
  });

  it('covers the worst case with a 7% buffer', () => {
    expect(r.money.covers).toBe(true);
    expect(r.money.bufferPct).toBe(7);
    expect(r.money.howEstimated).toContain('the Mastercard rate (3.1%)');
    expect(r.money.howEstimated).toContain('Fines follow');
  });

  it('writes the conditions and the seller message', () => {
    expect(r.conditions[0]).toContain('Sep–Oct sales');
    expect(r.conditions[1]).toContain('3D Secure');
    expect(r.conditions[2]).toContain('4 open disputes');
    expect(r.message.startsWith('Hi Brightline team,')).toBe(true);
    expect(r.message).toContain('$14,000 today');
    expect(r.message).toContain('Jun–Aug sales');
    expect(r.message).toContain('We\'ll look again on Dec 15, 2026.');
  });

  it('lets an edited message win', () => {
    expect(buildReport(view, { ...cs, sellerMessage: 'Custom' }, 'A', RULES_V1).message).toBe('Custom');
  });

  it('lists findings and attachments', () => {
    expect(r.findings.confirmed).toHaveLength(2);
    expect(r.findings.dismissed[0]).toMatchObject({ id: 'c', note: 'Looks organic' });
    expect(r.attachments).toContainEqual({ title: 'Ad receipts', page: 4 });
    expect(r.attachments).toContainEqual({ title: 'Table · all 27 disputes', page: 3 });
  });

  it('compares against the reference decisions', () => {
    expect(r.consistency.current).toEqual({ ref: 'RF-0003', keptPct: 67 });
    expect(r.consistency.inLine).toBe(true);
    expect(r.footer).toBe(`RF-0003 · Generated by Risk Forge · Rules v${RULES_V1.version}`);
  });

  it('handles a case type without reference decisions', () => {
    const other = { ...view, forged: { ...forged, actualType: 'card-testing' } } as CaseView;
    const c = buildReport(other, cs, 'A', RULES_V1).consistency;
    expect(c.past).toEqual([]);
    expect(c.inLine).toBe(true);
    expect(c.range).toEqual([67, 67]);
  });

  it('builds the money sentence from keep and release, not the action', () => {
    const deny = (keep: number) => sellerMessage(view, { action: 'deny', keep, release: 4200000 - keep, reviewDate: '2026-12-15' });
    expect(deny(2800000)).toContain('releasing $14,000 today and keeping $28,000 for now');
    expect(deny(2800000)).not.toContain('the full');
    const approve = sellerMessage(view, { action: 'approve', keep: 1000000, release: 3200000, reviewDate: '2026-11-08' });
    expect(approve).toContain('releasing $32,000 today and keeping $10,000 for now');
    expect(approve).not.toContain('all of it');
  });

  it('checks coverage against the hold when the worst case is larger', () => {
    const big = { ...e, high: 4265000 };
    const whole = buildReport({ ...view, exposure: big }, { ...cs, decision: { ...suggestion } }, 'A', RULES_V1);
    expect(whole.money.covers).toBe(true);
    const part = buildReport({ ...view, exposure: big }, cs, 'A', RULES_V1);
    expect(part.money.covers).toBe(false);
  });

  it('varies the letter for deny and approve', () => {
    expect(sellerMessage(view, suggestion)).toContain('keeping the full $42,000');
    const approve = sellerMessage(view, { action: 'approve', keep: 0, release: 4200000, reviewDate: '2026-11-08' });
    expect(approve).toContain('releasing all of it');
    expect(approve.endsWith('— Risk Operations')).toBe(true);
    expect(approve).not.toContain("We'll look again");
  });
});

describe('buildReport path taken', () => {
  const NOW = '2026-11-08T10:00:00.000Z';
  const open = newCaseState('PD-009R-HF', false, NOW);
  const ANSWERS = { jump: ['yes'], hidden: ['yes'], brands: ['mc3', 'visa'], refunds: ['yes'], explained: ['no'], money: ['covers'] };
  const withAnswers = (answers: Record<string, string[]>, extra = {}) => {
    const flagStates = Object.fromEntries(['rate-hidden-by-growth', 'mc-over-limit', 'visa-over-limit', 'refunds-low-disputes-high', 'young-account-fast-growth'].map(id => [id, { state: 'confirmed' as const, note: '' }]));
    const cs = { ...open, ...extra, flagStates, playbook: { answers, collapsed: false } };
    return { cs, v: deriveCase(cs, RULES_V1) };
  };

  it('lists the answered steps in order with their questions and answers', () => {
    const { cs, v } = withAnswers(ANSWERS);
    const r = buildReport(v, cs, 'A', RULES_V1);
    expect(r.path).toHaveLength(6);
    expect(r.path[0]).toEqual({ question: 'Did sales jump recently?', answer: 'Yes — 5× last month', sets: [] });
    expect(r.path[1]).toEqual({ question: 'Is the rate on older sales at least double the 30-day rate?', answer: 'Yes', sets: ['Confirmed: Dispute rate hidden by growth'] });
    expect(r.pathConclusion).toBe('Partial release, keep $42,000');
    expect(buildReport(deriveCase(open, RULES_V1), open, 'A', RULES_V1).path).toEqual([]);
  });

  it('lists every flag a multi-select answer confirmed', () => {
    const { cs, v } = withAnswers(ANSWERS);
    const brands = buildReport(v, cs, 'A', RULES_V1).path[2]!;
    expect(brands.answer).toBe('Mastercard 3%+, Visa 1.5%+');
    expect(brands.sets).toEqual(['Confirmed: Mastercard 3.1%, over the excessive tier', 'Confirmed: Visa 1.8%, over the 1.5% line']);
  });

  it('lists a dismissed flag and nothing for a neutral answer', () => {
    const { cs, v } = withAnswers({ ...ANSWERS, brands: ['thin'], explained: ['documented'] });
    const path = buildReport(v, cs, 'A', RULES_V1).path;
    expect(path[2]).toMatchObject({ answer: 'Not enough data', sets: [] });
    expect(path[4]!.sets).toEqual(['Dismissed: 4-month-old account growing 5× in a month']);
  });

  it('hides the conclusion in an undecided practice case but keeps the own path', () => {
    const { cs, v } = withAnswers(ANSWERS, { practice: true });
    const r = buildReport(v, cs, 'A', RULES_V1);
    expect(r.pathConclusion).toBeNull();
    expect(r.path).toHaveLength(6);
    expect(buildReport(v, { ...cs, decidedAt: NOW }, 'A', RULES_V1).pathConclusion).toBe('Partial release, keep $42,000');
  });

  it('shows the stored rules version', () => {
    const { cs, v } = withAnswers(ANSWERS, { rulesVersion: '0.9' });
    const r = buildReport(v, cs, 'A', RULES_V1);
    expect(r.header.rules).toBe('v0.9');
    expect(r.footer).toBe(`${v.forged.displayId} · Generated by Risk Forge · Rules v0.9`);
  });
});
