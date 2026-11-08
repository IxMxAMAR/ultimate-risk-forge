import { RULES_V1 } from '../domain/ruleset';
import { encodeCaseCode } from '../domain/caseCode';
import { DIFFICULTIES, type Difficulty } from '../domain/types';
import { forgeCase } from '../forge/forge';
import { disputeStats } from './disputeMath';
import { runChecks } from './flags';

const BANDS: Record<Difficulty, [number, number]> = { easy: [0.026, Infinity], normal: [0.019, 0.028], hard: [0.016, 0.024] };

// Tuned Visa and Mastercard judged rates per difficulty (hiddenByGrowth.ts TUNING); rounding on medium pools moves them by well under 0.3 points.
const TUNED: Record<Difficulty, { visa: number; mastercard: number }> = { easy: { visa: 0.027, mastercard: 0.042 }, normal: { visa: 0.018, mastercard: 0.031 }, hard: { visa: 0.016, mastercard: 0.032 } };

describe('hidden-by-growth calibration', () => {
  for (const difficulty of DIFFICULTIES) for (const size of ['small', 'medium'] as const) for (const seed of [1, 7, 42, 1001, 65535]) {
    it(`${difficulty} ${size} seed ${seed}`, () => {
      const c = forgeCase(encodeCaseCode({ version: 1, type: 'hidden-by-growth', difficulty, size, seed }));
      const s = disputeStats(c, RULES_V1);
      const flags = runChecks(c, s, RULES_V1);
      for (const kind of c.groundTruth.planted) expect(flags.map(f => f.kind), `planted ${kind}`).toContain(kind);
      for (const kind of c.groundTruth.lookAlikes) expect(flags.find(f => f.kind === kind)?.severity).toBe('medium');
      expect(s.judgedRate).toBeGreaterThanOrEqual(BANDS[difficulty][0]);
      expect(s.judgedRate).toBeLessThanOrEqual(BANDS[difficulty][1]);
      if (size === 'medium') {
        expect(s.byBrandJudged.find(r => r.brand === 'mastercard')!.rate).toBeGreaterThanOrEqual(RULES_V1.limits.mcHecm);
        for (const brand of ['visa', 'mastercard'] as const) expect(Math.abs(s.byBrandJudged.find(r => r.brand === brand)!.rate - TUNED[difficulty][brand]), brand).toBeLessThan(0.003);
      }
    });
  }
});
