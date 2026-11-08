import { describe, expect, it } from 'vitest';
import { RULES_V1 } from '../domain/ruleset';
import { STARTER_CODES } from '../forge/starters';
import { newCaseState } from '../persist/db';
import { HIDDEN_BY_GROWTH } from '../playbooks/hiddenByGrowth';
import { deriveCase } from './derive';

const NOW = '2026-11-08T10:00:00.000Z';

describe('deriveCase', () => {
  it('merges flag states onto rule flags', () => {
    const cs = newCaseState(STARTER_CODES[1], true, NOW);
    const v = deriveCase(cs, RULES_V1);
    expect(v.flags.length).toBe(v.ruleFlags.length);
    const id = v.ruleFlags[0]!.id;
    const v2 = deriveCase({ ...cs, flagStates: { [id]: { state: 'confirmed', note: 'checked' } } }, RULES_V1);
    expect(v2.flags[0]).toMatchObject({ id, state: 'confirmed', note: 'checked' });
    expect(v2.ruleFlags[0]!.state).toBe('raised');
  });

  it('appends analyst flags', () => {
    const cs = newCaseState(STARTER_CODES[1], true, NOW);
    const v = deriveCase(cs, RULES_V1);
    const mine = { ...v.ruleFlags[0]!, id: 'analyst-1', kind: 'analyst' as const, addedBy: 'analyst' as const, state: 'confirmed' as const };
    const v2 = deriveCase({ ...cs, analystFlags: [mine] }, RULES_V1);
    expect(v2.flags.length).toBe(v.ruleFlags.length + 1);
    expect(v2.flags.at(-1)).toEqual(mine);
  });

  it('uses the playbook ending as the suggestion and follows the flags', () => {
    const cs = newCaseState(STARTER_CODES[1], true, NOW);
    const v = deriveCase(cs, RULES_V1);
    expect(v.playbook).toBe(HIDDEN_BY_GROWTH);
    expect(v.suggestion).toEqual(HIDDEN_BY_GROWTH.ending(v, RULES_V1));
    const flagStates = Object.fromEntries(v.ruleFlags.map(f => [f.id, { state: 'confirmed' as const, note: '' }]));
    const v2 = deriveCase({ ...cs, flagStates }, RULES_V1);
    expect(v2.suggestion).toEqual(HIDDEN_BY_GROWTH.ending(v2, RULES_V1));
    expect(v2.suggestion).not.toEqual(v.suggestion);
  });

  it('derives states saved without a playbook', () => {
    const cs = newCaseState(STARTER_CODES[1], true, NOW);
    expect(cs.playbook).toBeUndefined();
    expect(() => deriveCase(cs, RULES_V1)).not.toThrow();
  });
});
