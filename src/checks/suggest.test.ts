import { RULES_V1 } from '../domain/ruleset';
import type { Flag, Severity } from '../domain/types';
import { forgeCase } from '../forge/forge';
import { STARTER_CODES } from '../forge/starters';
import type { Exposure } from './exposure';
import { suggestDecision } from './suggest';

const base = forgeCase(STARTER_CODES[1]);
const c = { ...base, trigger: { ...base.trigger, heldAmount: 4200000 } };
const e = { high: 2616100 } as Exposure;
const flag = (severity: Severity, state: Flag['state'] = 'confirmed'): Flag => ({ id: `${severity}${state}`, kind: 'analyst', severity, title: '', why: '', evidence: { tab: 'disputes', ids: [] }, state, note: '', addedBy: 'analyst' });

describe('suggestDecision', () => {
  it('denies on two confirmed critical flags', () => {
    expect(suggestDecision(c, [flag('critical'), flag('critical')], e, RULES_V1)).toMatchObject({
      action: 'deny', keep: 4200000, release: 0, reviewDate: '2026-12-15', basis: 'From 2 confirmed critical flags', summary: 'Deny, keep all $42,000',
    });
  });

  it('partially releases on one critical or a high flag', () => {
    expect(suggestDecision(c, [flag('critical'), flag('critical', 'raised')], e, RULES_V1)).toMatchObject({
      action: 'partial-release', keep: 2800000, release: 1400000, basis: 'From confirmed flags and the money-at-risk model', summary: 'Partial release, keep $28,000',
    });
    expect(suggestDecision(c, [flag('high')], e, RULES_V1).action).toBe('partial-release');
  });

  it('never keeps more than is held', () => {
    expect(suggestDecision({ ...c, trigger: { ...c.trigger, heldAmount: 1000000 } }, [flag('high')], e, RULES_V1)).toMatchObject({ keep: 1000000, release: 0 });
  });

  it('approves with nothing confirmed at critical or high', () => {
    expect(suggestDecision(c, [flag('medium'), flag('high', 'dismissed')], e, RULES_V1)).toMatchObject({
      action: 'approve', keep: 0, release: 4200000, reviewDate: '2026-11-08', basis: 'No confirmed critical or high flags', summary: 'Release all $42,000',
    });
  });
});
