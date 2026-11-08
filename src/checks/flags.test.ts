import { RULES_V1 } from '../domain/ruleset';
import { actionLabel, reasonLabel } from '../domain/labels';
import { forgeCase } from '../forge/forge';
import { STARTER_CODES } from '../forge/starters';
import { disputeStats, type DisputeStats } from './disputeMath';
import { escalate, reviewDateFrom, runChecks } from './flags';

describe('escalate', () => {
  it('steps up at twice the threshold', () => {
    expect(escalate('high', 0.031, 0.015, RULES_V1)).toBe('critical');
    expect(escalate('high', 0.018, 0.015, RULES_V1)).toBe('high');
    expect(escalate('medium', 0.031, 0.015, RULES_V1)).toBe('high');
  });
});

describe('reviewDateFrom', () => {
  it.each([['2026-11-08', '2026-12-15'], ['2026-11-16', '2027-01-15'], ['2026-12-20', '2027-02-15'], ['2026-01-14', '2026-02-15']])('%s → %s', (asOf, want) => {
    expect(reviewDateFrom(asOf)).toBe(want);
  });
});

describe('labels', () => {
  it('names early-release actions', () => {
    expect(actionLabel('partial-release', 'early-release')).toBe('Partial release');
    expect(actionLabel('deny', 'early-release')).toBe('Deny early release');
    expect(actionLabel('approve', 'early-release')).toBe('Release the hold');
    expect(actionLabel('approve-smaller-hold', 'early-release')).toBe('Approve with a smaller hold');
    expect(reasonLabel('not_received')).toBe('not received');
  });
});

describe('runChecks', () => {
  const c = forgeCase(STARTER_CODES[1]);
  const s = disputeStats(c, RULES_V1);

  it('raises the normal starter flags in order with exact text', () => {
    const flags = runChecks(c, s, RULES_V1);
    expect(flags.map(f => [f.kind, f.severity, f.title, f.evidence.ids])).toEqual([
      ['rate-hidden-by-growth', 'critical', 'Dispute rate hidden by growth', ['month:2026-06', 'month:2026-07', 'month:2026-08']],
      ['mc-over-limit', 'critical', 'Mastercard 3.1%, over the excessive tier', ['brand:mastercard']],
      ['visa-over-limit', 'high', 'Visa 1.8%, over the 1.5% line', ['brand:visa']],
      ['refunds-low-disputes-high', 'medium', 'Refunds low (0.6%), disputes high', ['kpi:refund-rate', 'reasons']],
      ['young-account-fast-growth', 'medium', '4-month-old account growing 5× in a month', ['kpi:account-age']],
    ]);
    expect(flags.map(f => f.why)).toEqual([
      "Why it matters: 5× more sales last month means most payments haven't had time to be disputed. The real rate is 2.3%, not 0.4%.",
      'Why it matters: Mastercard fines sellers over its limits, and fines grow every month the seller stays over.',
      'Why it matters: Visa fines sellers who stay over its line. The platform is responsible for keeping every seller under it.',
      'Why it matters: unhappy buyers go to their bank instead of the seller — 6 of 23 disputes say “fraudulent”.',
      'Why it matters: new accounts that grow very fast are where sudden losses usually come from.',
    ]);
    expect(flags.every(f => f.state === 'raised' && f.note === '' && f.addedBy === 'rules' && f.id === f.kind && f.evidence.tab === 'disputes')).toBe(true);
  });

  it('keeps Mastercard between 1.5% and 3% at high with the 1.5% line title', () => {
    const byBrandJudged = s.byBrandJudged.map(r => (r.brand === 'mastercard' ? { ...r, rate: 0.021 } : r));
    const mc = runChecks(c, { ...s, byBrandJudged }, RULES_V1).find(f => f.kind === 'mc-over-limit')!;
    expect([mc.severity, mc.title]).toEqual(['high', 'Mastercard 2.1%, over the 1.5% line']);
  });

  it('escalates Mastercard and Visa to critical at 3%', () => {
    const rate = (brand: string) => (r: DisputeStats['byBrandJudged'][number]) => (r.brand === brand ? { ...r, rate: 0.031 } : r);
    const mc = runChecks(c, { ...s, byBrandJudged: s.byBrandJudged.map(rate('mastercard')) }, RULES_V1).find(f => f.kind === 'mc-over-limit')!;
    expect([mc.severity, mc.title]).toEqual(['critical', 'Mastercard 3.1%, over the excessive tier']);
    const visa = runChecks(c, { ...s, byBrandJudged: s.byBrandJudged.map(rate('visa')) }, RULES_V1).find(f => f.kind === 'visa-over-limit')!;
    expect([visa.severity, visa.title]).toEqual(['critical', 'Visa 3.1%, over the 1.5% line']);
  });

  it('caps look-alike kinds at medium', () => {
    const lookAlike = { ...c, groundTruth: { ...c.groundTruth, lookAlikes: ['mc-over-limit' as const] } };
    expect(runChecks(lookAlike, s, RULES_V1).find(f => f.kind === 'mc-over-limit')!.severity).toBe('medium');
  });

  it('ignores a brand below the minimum payments', () => {
    const thin: DisputeStats = { ...s, byBrandJudged: s.byBrandJudged.map(r => (r.brand === 'mastercard' || r.brand === 'visa' ? { ...r, payments: 29, rate: 0.09 } : r)) };
    const kinds = runChecks(c, thin, RULES_V1).map(f => f.kind);
    expect(kinds).not.toContain('mc-over-limit');
    expect(kinds).not.toContain('visa-over-limit');
  });
});
