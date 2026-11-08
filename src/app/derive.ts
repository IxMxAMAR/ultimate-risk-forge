import type { Ruleset } from '../domain/ruleset';
import type { Flag, ForgedCase } from '../domain/types';
import { disputeStats, type DisputeStats } from '../checks/disputeMath';
import { exposure, type Exposure } from '../checks/exposure';
import { runChecks } from '../checks/flags';
import { suggestDecision, type Suggestion } from '../checks/suggest';
import { forgeCase } from '../forge/forge';
import { playbookFor } from '../playbooks';
import type { Playbook } from '../playbooks/types';
import type { CaseState } from '../persist/db';

export interface CaseView { forged: ForgedCase; stats: DisputeStats; ruleFlags: Flag[]; flags: Flag[]; exposure: Exposure; playbook: Playbook | null; suggestion: Suggestion }

type Base = Omit<CaseView, 'flags' | 'playbook' | 'suggestion'>;

// A forged case and its checks never change for a code, so they are computed once (ARCHITECTURE.md §4).
const cache = new Map<string, Base>();

// A stored code that no longer forges (for example one from another generator version) is unreadable, not fatal.
export function tryDeriveCase(cs: CaseState, rules: Ruleset): CaseView | null {
  try { return deriveCase(cs, rules); } catch { return null; }
}

// A case decided before rules v1.1 carries no version: it was signed under v1.0 and keeps that suggestion (ARCHITECTURE.md §4).
const signedBeforeV11 = (cs: CaseState): boolean => cs.decidedAt !== null && cs.rulesVersion === undefined;
export const rulesVersionOf = (cs: CaseState, rules: Ruleset): string => (signedBeforeV11(cs) ? '1.0' : cs.rulesVersion ?? rules.version);

export function deriveCase(cs: CaseState, rules: Ruleset): CaseView {
  let base = cache.get(cs.code);
  if (!base) {
    const forged = forgeCase(cs.code);
    const stats = disputeStats(forged, rules);
    base = { forged, stats, ruleFlags: runChecks(forged, stats, rules), exposure: exposure(stats, rules) };
    cache.set(cs.code, base);
  }
  const flags = [...base.ruleFlags.map(f => ({ ...f, ...cs.flagStates[f.id] })), ...cs.analystFlags];
  const playbook = playbookFor(base.forged.actualType);
  const view = { ...base, flags, playbook };
  return { ...view, suggestion: playbook && !signedBeforeV11(cs) ? playbook.ending(view, rules) : suggestDecision(base.forged, flags, base.exposure, rules) };
}
