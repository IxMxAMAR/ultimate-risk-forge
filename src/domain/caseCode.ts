import { CROCKFORD, checkChar, decodeBase32, encodeBase32, normalizeCode } from '../lib/base32';
import { createRng } from '../lib/rng';
import { CASE_TYPES, DIFFICULTIES, SIZES, type CaseSpec } from './types';

// Packing is frozen for generator v1 (ARCHITECTURE.md §8).
export const CURRENT_GENERATOR_VERSION = 1;

export class CaseCodeError extends Error {}

const mask = (seed: number): number => Math.floor(createRng((seed ^ 0x5f3759df) >>> 0).next() * 2048);

export function encodeCaseCode(spec: CaseSpec): string {
  const header = (spec.version << 8) | (CASE_TYPES.indexOf(spec.type) << 4) | (DIFFICULTIES.indexOf(spec.difficulty) << 2) | SIZES.indexOf(spec.size);
  const packed = (BigInt(header ^ mask(spec.seed)) << 24n) | BigInt(spec.seed & 0xffffff);
  const body = encodeBase32(packed, 7);
  const c = body + checkChar(body);
  return `${c.slice(0, 2)}-${c.slice(2, 6)}-${c.slice(6, 8)}`;
}

export function decodeCaseCode(raw: string): CaseSpec {
  const code = normalizeCode(raw);
  if (code.length !== 8) throw new CaseCodeError('A case code has 8 characters');
  if ([...code].some((ch) => !CROCKFORD.includes(ch))) throw new CaseCodeError("That isn't a case code");
  const body = code.slice(0, 7);
  if (checkChar(body) !== code[7]) throw new CaseCodeError("Typo in the code — the last character doesn't match");
  const packed = decodeBase32(body);
  const seed = Number(packed & 0xffffffn);
  const header = Number(packed >> 24n) ^ mask(seed);
  const version = header >> 8;
  if (version > CURRENT_GENERATOR_VERSION) throw new CaseCodeError('Made with a newer version of Risk Forge');
  const type = CASE_TYPES[(header >> 4) & 15];
  const difficulty = DIFFICULTIES[(header >> 2) & 3];
  const size = SIZES[header & 3];
  if (version === 0 || !type || !difficulty || !size) throw new CaseCodeError("That isn't a case code");
  return { version, type, difficulty, size, seed };
}

export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! & 0xffffff;
}

export const displayIdFor = (seed: number): string => 'RF-' + String(seed % 10000).padStart(4, '0');
