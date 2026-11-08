export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function encodeBase32(n: bigint, length: number): string {
  let out = '';
  let v = n;
  for (let i = 0; i < length; i++) {
    out = CROCKFORD[Number(v % 32n)]! + out;
    v /= 32n;
  }
  return out;
}

export function decodeBase32(s: string): bigint {
  let n = 0n;
  for (const ch of s) n = n * 32n + BigInt(CROCKFORD.indexOf(ch));
  return n;
}

export function checkChar(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += (i + 1) * CROCKFORD.indexOf(body[i]!);
  return CROCKFORD[sum % 31]!;
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
}
