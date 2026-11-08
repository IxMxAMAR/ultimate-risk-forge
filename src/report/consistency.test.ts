import { describe, expect, it } from 'vitest';
import { consistency, REFERENCE_DECISIONS } from './consistency';

describe('consistency', () => {
  const past = REFERENCE_DECISIONS['hidden-by-growth']!;

  it('has four reference decisions', () => {
    expect(past).toHaveLength(4);
    expect(past.every(p => p.reference)).toBe(true);
  });

  it('is in line with the reference set', () => {
    expect(consistency({ action: 'partial-release', keptPct: 67 }, past)).toEqual({ median: 67.5, inLine: true, range: [60, 70] });
  });

  it('flags a keep far from the median', () => {
    expect(consistency({ action: 'partial-release', keptPct: 40 }, past).inLine).toBe(false);
  });

  it('falls back to all entries when no past decision shares the action', () => {
    expect(consistency({ action: 'approve', keptPct: 67 }, past).range).toEqual([60, 100]);
  });
});
