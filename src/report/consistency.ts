import type { ActionKind, CaseTypeId } from '../domain/types';

export interface PastDecision { ref: string; action: ActionKind; keptPct: number; reference: boolean }

export const REFERENCE_DECISIONS: Partial<Record<CaseTypeId, PastDecision[]>> = {
  'hidden-by-growth': [
    { ref: 'Reference A', action: 'partial-release', keptPct: 65, reference: true },
    { ref: 'Reference B', action: 'partial-release', keptPct: 70, reference: true },
    { ref: 'Reference C', action: 'partial-release', keptPct: 60, reference: true },
    { ref: 'Reference D', action: 'deny', keptPct: 100, reference: true },
  ],
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function consistency(current: { action: ActionKind; keptPct: number }, past: PastDecision[]): { median: number; inLine: boolean; range: [number, number] } {
  const mid = median(past.map(p => p.keptPct));
  const same = past.filter(p => p.action === current.action);
  const pcts = (same.length ? same : past).map(p => p.keptPct);
  return { median: mid, inLine: Math.abs(current.keptPct - mid) <= 10, range: [Math.min(...pcts), Math.max(...pcts)] };
}
