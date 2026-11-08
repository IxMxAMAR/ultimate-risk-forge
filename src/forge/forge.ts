import { decodeCaseCode, displayIdFor } from '../domain/caseCode';
import type { CaseTypeId, ForgedCase } from '../domain/types';
import { createRng } from '../lib/rng';
import { generateHiddenByGrowth } from './generators/hiddenByGrowth';

export const AVAILABLE_TYPES: readonly CaseTypeId[] = ['hidden-by-growth', 'surprise'];
const CONCRETE_AVAILABLE = AVAILABLE_TYPES.filter((t) => t !== 'surprise');

export function forgeCase(code: string): ForgedCase {
  const spec = decodeCaseCode(code);
  if (!AVAILABLE_TYPES.includes(spec.type)) throw new Error('This kind of case is coming soon');
  const surprise = spec.type === 'surprise';
  const actualType = surprise ? createRng(spec.seed ^ 0x9e3779b9).pick(CONCRETE_AVAILABLE) : spec.type;
  const body = generateHiddenByGrowth(spec, createRng(spec.seed));
  return { code, displayId: displayIdFor(spec.seed), spec, actualType, surprise, ...body };
}
