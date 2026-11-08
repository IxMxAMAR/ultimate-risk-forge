import { formatMoney } from '../lib/money';
import type { Ruleset } from '../domain/ruleset';
import type { Decision, Flag, ForgedCase } from '../domain/types';
import { holdToKeep, type Exposure } from './exposure';
import { reviewDateFrom } from './flags';

export interface Suggestion extends Decision { basis: string; summary: string }

export function suggestDecision(c: ForgedCase, flags: Flag[], e: Exposure, rules: Ruleset): Suggestion {
  const held = c.trigger.heldAmount;
  const confirmed = flags.filter(f => f.state === 'confirmed');
  const critical = confirmed.filter(f => f.severity === 'critical').length;
  const high = confirmed.filter(f => f.severity === 'high').length;
  const reviewDate = reviewDateFrom(c.asOf);

  if (critical >= 2) {
    return { action: 'deny', keep: held, release: 0, reviewDate, basis: `From ${critical} confirmed critical flags`, summary: `Deny, keep all ${formatMoney(held)}` };
  }
  if (critical === 1 || high >= 1) {
    const keep = Math.min(held, holdToKeep(e.high, rules));
    return { action: 'partial-release', keep, release: held - keep, reviewDate, basis: 'From confirmed flags and the money-at-risk model', summary: `Partial release, keep ${formatMoney(keep)}` };
  }
  return { action: 'approve', keep: 0, release: held, reviewDate: c.asOf, basis: 'No confirmed critical or high flags', summary: `Release all ${formatMoney(held)}` };
}
