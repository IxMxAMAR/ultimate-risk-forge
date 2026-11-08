import { createRng } from './rng';

describe('rng', () => {
  it('mulberry32 sequence is frozen', () => {
    const r = createRng(42);
    expect([r.next(), r.next(), r.next()]).toEqual([0.6011037519201636, 0.44829055899754167, 0.8524657934904099]);
  });
  it('int is inclusive and frozen', () => {
    const r = createRng(42);
    expect([1, 2, 3, 4, 5].map(() => r.int(1, 6))).toEqual([4, 3, 6, 5, 2]);
  });
  it('weighted never picks a zero-weight item', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) expect(r.weighted([['a', 1], ['b', 0]] as const)).toBe('a');
  });
  it('pick and chance use the sequence', () => {
    const r = createRng(42);
    expect(r.pick(['x', 'y'])).toBe('y');
    expect(r.chance(0.5)).toBe(true);
  });
});
