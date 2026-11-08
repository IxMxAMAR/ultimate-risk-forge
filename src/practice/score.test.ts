import { describe, expect, it } from 'vitest';
import { RULES_V1 } from '../domain/ruleset';
import type { Decision, Flag, ForgedCase } from '../domain/types';
import { disputeStats } from '../checks/disputeMath';
import { runChecks } from '../checks/flags';
import { forgeCase } from '../forge/forge';
import { STARTER_CODES } from '../forge/starters';
import { scoreCase } from './score';

const hard = (): { c: ForgedCase; flags: Flag[] } => {
  const c = forgeCase(STARTER_CODES[2]!);
  return { c, flags: runChecks(c, disputeStats(c, RULES_V1), RULES_V1) };
};
const play = (flags: Flag[], confirm: string[], dismiss: string[]): Flag[] =>
  flags.map(f => ({ ...f, state: confirm.includes(f.id) ? 'confirmed' : dismiss.includes(f.id) ? 'dismissed' : f.state }));

describe('scoreCase', () => {
  const { c, flags } = hard();
  const worst = Math.round(c.trigger.heldAmount / 2);
  const decision = (over: Partial<Decision> = {}): Decision => ({ action: 'partial-release', keep: c.trigger.heldAmount, release: 0, reviewDate: '2026-12-15', ...over });
  const perfect = play(flags, c.groundTruth.planted, c.groundTruth.lookAlikes);

  it('uses the hard starter ground truth', () => {
    expect(c.groundTruth.planted).toHaveLength(4);
    expect(c.groundTruth.lookAlikes).toEqual(['young-account-fast-growth']);
  });

  it('scores perfect play 100', () => {
    const s = scoreCase(c, perfect, [], decision(), worst);
    expect(s).toMatchObject({ total: 100, flags: 40, dismissals: 15, decision: 30, amounts: 15, missed: [], wronglyConfirmed: [] });
  });

  it('penalises confirming the look-alike', () => {
    const s = scoreCase(c, play(flags, [...c.groundTruth.planted, ...c.groundTruth.lookAlikes], []), [], decision(), worst);
    expect(s.flags).toBe(35);
    expect(s.dismissals).toBe(0);
    expect(s.total).toBe(80);
    expect(s.wronglyConfirmed).toHaveLength(1);
  });

  it('gives half credit to an adjacent action', () => {
    expect(scoreCase(c, perfect, [], decision({ action: 'escalate' }), worst).decision).toBe(15);
  });

  it('gives no credit to an unrelated action', () => {
    expect(scoreCase(c, perfect, [], decision({ action: 'approve' }), worst).decision).toBe(0);
  });

  it('scores no amount credit when keep is under the worst case', () => {
    expect(scoreCase(c, perfect, [], decision({ keep: worst - 1 }), worst).amounts).toBe(0);
  });

  it('credits the amounts when the worst case is larger than the hold and the whole hold is kept', () => {
    const held = c.trigger.heldAmount;
    expect(scoreCase(c, perfect, [], decision({ keep: held }), held + 1).amounts).toBe(15);
    expect(scoreCase(c, perfect, [], decision({ keep: held - 1 }), held + 1).amounts).toBe(0);
  });

  it('gives no credit for a dismissed analyst flag', () => {
    const unconfirmed = play(flags, c.groundTruth.planted.filter(k => k !== 'mc-over-limit'), c.groundTruth.lookAlikes);
    const analyst: Flag = { id: 'a1', kind: 'analyst', severity: 'high', title: 'MC', why: '', evidence: { tab: 'disputes', ids: ['brand:mastercard'] }, state: 'dismissed', note: '', addedBy: 'analyst' };
    expect(scoreCase(c, unconfirmed, [analyst], decision(), worst).missed).toHaveLength(1);
  });

  it('counts an analyst flag on the same evidence as finding the kind', () => {
    const unconfirmed = play(flags, c.groundTruth.planted.filter(k => k !== 'mc-over-limit'), c.groundTruth.lookAlikes);
    const missing = scoreCase(c, unconfirmed, [], decision(), worst);
    expect(missing.missed).toHaveLength(1);
    expect(missing.flags).toBe(30);
    const analyst: Flag = { id: 'a1', kind: 'analyst', severity: 'high', title: 'MC', why: '', evidence: { tab: 'disputes', ids: ['brand:mastercard'] }, state: 'confirmed', note: '', addedBy: 'analyst' };
    const found = scoreCase(c, unconfirmed, [analyst], decision(), worst);
    expect(found.missed).toEqual([]);
    expect(found.flags).toBe(40);
  });
});
