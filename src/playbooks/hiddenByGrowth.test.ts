import { deriveCase, type CaseView } from '../app/derive';
import { encodeCaseCode } from '../domain/caseCode';
import { RULES_V1 } from '../domain/ruleset';
import { DIFFICULTIES, type FlagKind } from '../domain/types';
import { newCaseState, type CaseState } from '../persist/db';
import { answerStep, expectedPath } from './engine';
import { HIDDEN_BY_GROWTH as pb } from './hiddenByGrowth';
import { playbookFor } from './index';

const stateFor = (code: string, flagStates: CaseState['flagStates'] = {}): CaseState => ({ ...newCaseState(code, false, '2026-01-01T00:00:00.000Z'), flagStates });
const codeFor = (difficulty: (typeof DIFFICULTIES)[number], size: 'small' | 'medium', seed: number) => encodeCaseCode({ version: 1, type: 'hidden-by-growth', difficulty, size, seed });

describe('hidden-by-growth playbook', () => {
  for (const difficulty of DIFFICULTIES) for (const size of ['small', 'medium'] as const) for (const seed of [1, 7, 42, 1001, 65535]) {
    it(`expected path settles ${difficulty} ${size} seed ${seed}`, () => {
      const code = codeFor(difficulty, size, seed);
      let v = deriveCase(stateFor(code), RULES_V1);
      const path = expectedPath(pb, v);
      const flagStates: CaseState['flagStates'] = {};
      let answers = {};
      for (const step of pb.steps) {
        const chosen = path[step.id];
        if (!chosen) continue;
        const r = answerStep(pb, v, answers, step.id, chosen);
        answers = r.answers;
        for (const [id, state] of Object.entries(r.flagStates)) flagStates[id] = { state, note: '' };
        v = deriveCase(stateFor(code, flagStates), RULES_V1);
      }
      const confirmed = (k: FlagKind) => v.flags.find(f => f.id === k)?.state === 'confirmed';
      for (const k of v.forged.groundTruth.planted) expect(confirmed(k), `planted ${k}`).toBe(true);
      for (const k of v.forged.groundTruth.lookAlikes) expect(confirmed(k), `look-alike ${k}`).toBe(false);
      expect(v.forged.groundTruth.acceptable).toContain(pb.ending(v, RULES_V1).action);
    });
  }

  it('offers no option for a brand under the payment minimum', () => {
    const v = deriveCase(stateFor(codeFor('easy', 'small', 1)), RULES_V1);
    const brands = pb.steps.find(s => s.id === 'brands')!;
    const thin = (name: 'visa' | 'mastercard'): CaseView => ({ ...v, stats: { ...v.stats, byBrandJudged: v.stats.byBrandJudged.map(r => (r.brand === name ? { ...r, payments: 5, rate: 0.5 } : r)) } });
    expect(brands.expected(thin('mastercard'))).not.toContain('mc3');
    expect(brands.expected(thin('mastercard'))).not.toContain('mc15');
    expect(brands.expected(thin('visa'))).not.toContain('visa');
    const none: CaseView = { ...v, stats: { ...v.stats, byBrandJudged: v.stats.byBrandJudged.map(r => ({ ...r, payments: 5 })) } };
    expect(brands.expected(none)).toEqual(['thin']);
  });

  describe('ending', () => {
    const base = deriveCase(stateFor(codeFor('normal', 'medium', 7)), RULES_V1);
    const withFlags = (confirm: string, held: number, high: number): CaseView => ({
      ...base,
      forged: { ...base.forged, trigger: { ...base.forged.trigger, heldAmount: held } },
      exposure: { ...base.exposure, high },
      flags: base.flags.map(f => ({ ...f, state: f.id === confirm ? 'confirmed' : 'raised' })),
    });
    const medium = base.flags.find(f => f.severity === 'medium')!.id;
    const risky = base.flags.find(f => f.severity !== 'medium')!.id;

    it('approves when only medium flags are confirmed', () => {
      expect(pb.ending(withFlags(medium, 5000000, 1000000), RULES_V1)).toMatchObject({ action: 'approve', keep: 0, release: 5000000, reviewDate: base.forged.asOf });
    });
    it('partially releases when risk is confirmed and the hold exceeds the hold to keep', () => {
      expect(pb.ending(withFlags(risky, 5000000, 1000000), RULES_V1)).toMatchObject({ action: 'partial-release', keep: 1100000, release: 3900000, summary: 'Partial release, keep $11,000' });
    });
    it('denies when risk is confirmed and the hold does not cover the worst case', () => {
      expect(pb.ending(withFlags(risky, 1000000, 5000000), RULES_V1)).toMatchObject({ action: 'deny', keep: 1000000, release: 0, summary: 'Deny, keep all $10,000' });
    });
    it('denies instead of releasing $0 when the hold to keep is not below the hold', () => {
      expect(pb.ending(withFlags(risky, 1000000, 960000), RULES_V1)).toMatchObject({ action: 'deny', keep: 1000000, release: 0 });
    });
    it('denies when the hold equals the worst case', () => {
      expect(pb.ending(withFlags(risky, 1000000, 1000000), RULES_V1)).toMatchObject({ action: 'deny', keep: 1000000, release: 0 });
    });
    it('expects Falls short when the hold is not above the hold to keep', () => {
      const money = pb.steps.find(s => s.id === 'money')!;
      expect(money.expected(withFlags(risky, 5000000, 1000000))).toEqual(['covers']);
      expect(money.expected(withFlags(risky, 1000000, 960000))).toEqual(['short']);
    });
  });

  it('is the playbook only for hidden-by-growth', () => {
    expect(playbookFor('hidden-by-growth')).toBe(pb);
    expect(playbookFor('forged-statement')).toBeNull();
  });
});
