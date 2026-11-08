import { RULES_V1 } from '../domain/ruleset';
import { actionLabel, reasonLabel } from '../domain/labels';
import { forgeCase } from '../forge/forge';
import { STARTER_CODES } from '../forge/starters';
import { disputeStats, type DisputeStats } from './disputeMath';
import { escalate, FLAG_ORDER, reviewDateFrom, runChecks } from './flags';

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

  it('raises sorted flags with rule defaults', () => {
    const flags = runChecks(c, s, RULES_V1);
    expect(flags.map(f => f.kind)).toEqual(['rate-hidden-by-growth', 'mc-over-limit', 'visa-over-limit', 'refunds-low-disputes-high', 'young-account-fast-growth'].sort((a, b) => {
      const sev = (k: string) => flags.find(f => f.kind === k)!.severity;
      const rank = (k: string) => ['critical', 'high', 'medium'].indexOf(sev(k));
      return rank(a) - rank(b) || FLAG_ORDER.indexOf(a as never) - FLAG_ORDER.indexOf(b as never);
    }));
    expect(flags.every(f => f.state === 'raised' && f.note === '' && f.addedBy === 'rules' && f.id === f.kind && f.evidence.tab === 'disputes')).toBe(true);
    expect(flags[0]!.title).toBe('Dispute rate hidden by growth');
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
