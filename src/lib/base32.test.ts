import { checkChar, decodeBase32, encodeBase32, normalizeCode } from './base32';

describe('base32', () => {
  it('base32 round-trips', () => {
    expect(decodeBase32(encodeBase32(34359738367n, 7))).toBe(34359738367n);
    expect(encodeBase32(0n, 7)).toBe('0000000');
  });
  it('checkChar is weighted mod 31', () => {
    expect(checkChar('0000000')).toBe('0');
    expect(checkChar('1000000')).toBe('1');
    expect(checkChar('0100000')).toBe('2');
  });
  it('normalizeCode', () => {
    expect(normalizeCode(' pd-oo9r-hf ')).toBe('PD009RHF');
    expect(normalizeCode('il')).toBe('11');
  });
});
