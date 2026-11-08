import { CASE_TYPES, DIFFICULTIES, SIZES, type CaseSpec, type Difficulty, type SellerSize } from './types';
import { CaseCodeError, decodeCaseCode, displayIdFor, encodeCaseCode, randomSeed } from './caseCode';

const hbg = (difficulty: Difficulty, seed: number, size: SellerSize = 'medium'): CaseSpec => ({ version: 1, type: 'hidden-by-growth', difficulty, size, seed });

describe('case codes', () => {
  it('pinned starter codes', () => {
    expect(encodeCaseCode(hbg('easy', 20005))).toBe('ZM-G0KH-5A');
    expect(encodeCaseCode(hbg('normal', 10001))).toBe('PD-009R-HF');
    expect(encodeCaseCode(hbg('hard', 70003))).toBe('VT-G24B-KD');
    expect(encodeCaseCode({ version: 1, type: 'surprise', difficulty: 'hard', size: 'large', seed: 0xFFFFFF })).toBe('G1-ZZZZ-ZJ');
    expect(encodeCaseCode({ version: 1, type: 'forged-statement', difficulty: 'easy', size: 'small', seed: 0 })).toBe('XK-G000-0P');
    expect(encodeCaseCode({ version: 1, type: 'surprise', difficulty: 'normal', size: 'medium', seed: 4242 })).toBe('NS-0044-JR');
  });
  it('round-trips every type/difficulty/size', () => {
    for (const type of CASE_TYPES) for (const difficulty of DIFFICULTIES) for (const size of SIZES) {
      const s: CaseSpec = { version: 1, type, difficulty, size, seed: 123456 };
      expect(decodeCaseCode(encodeCaseCode(s))).toEqual(s);
    }
  });
  it('accepts sloppy input', () => {
    expect(decodeCaseCode(' pd 009r hf ')).toEqual(hbg('normal', 10001));
    expect(decodeCaseCode('PD-OO9R-HF')).toEqual(hbg('normal', 10001));
  });
  it('catches typos', () => {
    expect(() => decodeCaseCode('PD-009R-HG')).toThrow(/typo/i);
    expect(() => decodeCaseCode('DP-009R-HF')).toThrow(/typo/i);
  });
  it('rejects wrong length', () => {
    expect(() => decodeCaseCode('PD-009R')).toThrow(/8 characters/);
  });
  it('rejects characters outside the alphabet', () => {
    expect(() => decodeCaseCode('PD-009U-HF')).toThrow(CaseCodeError);
    expect(() => decodeCaseCode('PD-009U-HF')).toThrow(/isn't a case code/);
  });
  it('rejects codes from a newer version', () => {
    expect(() => decodeCaseCode('TD-009R-HK')).toThrow(/newer version/i);
  });
  it('display id', () => {
    expect(displayIdFor(70003)).toBe('RF-0003');
  });
  it('random seed fits 24 bits', () => {
    const s = randomSeed();
    expect(Number.isInteger(s) && s >= 0 && s <= 0xffffff).toBe(true);
  });
});
