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
    expect(v.suggestion).toMatchObject({ action: 'approve', keep: 0, release: 6400000, summary: 'Release all $64,000' });
    const flagStates = Object.fromEntries(v.ruleFlags.map(f => [f.id, { state: 'confirmed' as const, note: '' }]));
    const v2 = deriveCase({ ...cs, flagStates }, RULES_V1);
    expect(v2.suggestion).toMatchObject({ action: 'partial-release', keep: 4200000, release: 2200000, summary: 'Partial release, keep $42,000' });
  });

  it('keeps the v1.0 suggestion of a case decided before rules v1.1', () => {
    const cs = newCaseState(STARTER_CODES[1], true, NOW);
    const flagStates = Object.fromEntries(['rate-hidden-by-growth', 'mc-over-limit'].map(id => [id, { state: 'confirmed' as const, note: '' }]));
    expect(deriveCase({ ...cs, flagStates }, RULES_V1).suggestion.summary).toBe('Partial release, keep $42,000');
    expect(deriveCase({ ...cs, flagStates, decidedAt: NOW }, RULES_V1).suggestion.summary).toBe('Deny, keep all $64,000');
    expect(deriveCase({ ...cs, flagStates, decidedAt: NOW, rulesVersion: '1.1' }, RULES_V1).suggestion.summary).toBe('Partial release, keep $42,000');
  });

  it('counts the critical and high flags still open while the suggestion releases the hold', () => {
    const cs = newCaseState(STARTER_CODES[1], false, NOW);
    const v = deriveCase(cs, RULES_V1);
    expect(v.suggestion.action).toBe('approve');
    expect(v.reviewFirst).toBe(3);
    const risky = v.ruleFlags.filter(f => f.severity === 'critical' || f.severity === 'high');
    const dismissed = deriveCase({ ...cs, flagStates: Object.fromEntries(risky.map(f => [f.id, { state: 'dismissed' as const, note: '' }])) }, RULES_V1);
    expect(dismissed.flags.filter(f => f.state === 'raised').map(f => f.severity)).toEqual(['medium', 'medium']);
    expect(dismissed.reviewFirst).toBe(0);
    const confirmed = deriveCase({ ...cs, flagStates: { 'rate-hidden-by-growth': { state: 'confirmed', note: '' } } }, RULES_V1);
    expect(confirmed.suggestion.action).toBe('partial-release');
    expect(confirmed.reviewFirst).toBe(0);
  });

  it('derives states saved without a playbook', () => {
    const cs = newCaseState(STARTER_CODES[1], true, NOW);
    expect(cs.playbook).toBeUndefined();
    expect(() => deriveCase(cs, RULES_V1)).not.toThrow();
  });
});
