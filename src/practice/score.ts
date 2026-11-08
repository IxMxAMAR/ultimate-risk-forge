import type { Cents } from '../lib/money';
import type { Decision, Flag, FlagKind, ForgedCase } from '../domain/types';

export interface Score { total: number; flags: number; dismissals: number; decision: number; amounts: number; missed: string[]; wronglyConfirmed: string[] }

const FLAGS_MAX = 40;
const DISMISSALS_MAX = 15;
const DECISION_MAX = 30;
const AMOUNTS_MAX = 15;

export function scoreCase(c: ForgedCase, ruleFlags: Flag[], analystFlags: Flag[], d: Decision, worst: Cents): Score {
  const { planted, lookAlikes, acceptable, adjacent } = c.groundTruth;
  const ruleFlag = (kind: FlagKind) => ruleFlags.find(f => f.kind === kind);
  const found = (kind: FlagKind): boolean => {
    const rule = ruleFlag(kind);
    if (!rule) return false;
    return rule.state === 'confirmed' || analystFlags.some(a => a.evidence.ids.some(id => rule.evidence.ids.includes(id)));
  };
  const titleOf = (kind: FlagKind): string => ruleFlag(kind)?.title ?? kind;

  const share = FLAGS_MAX / planted.length;
  const missedKinds = planted.filter(k => !found(k));
  const confirmedLookAlikes = lookAlikes.filter(k => ruleFlag(k)?.state === 'confirmed');
  const flags = Math.min(FLAGS_MAX, Math.max(0, share * (planted.length - missedKinds.length) - (share / 2) * confirmedLookAlikes.length));

  const dismissed = (kinds: FlagKind[]) => kinds.filter(k => ruleFlag(k)?.state === 'dismissed').length;
  const dismissals = lookAlikes.length > 0
    ? DISMISSALS_MAX * dismissed(lookAlikes) / lookAlikes.length
    : DISMISSALS_MAX * (1 - dismissed(planted) / planted.length);

  const decision = acceptable.includes(d.action) ? DECISION_MAX : adjacent.includes(d.action) ? DECISION_MAX / 2 : 0;
  const amounts = d.keep >= worst && d.keep <= c.trigger.heldAmount ? AMOUNTS_MAX : 0;

  return {
    total: Math.round(flags + dismissals + decision + amounts),
    flags, dismissals, decision, amounts,
    missed: missedKinds.map(titleOf),
    wronglyConfirmed: confirmedLookAlikes.map(titleOf),
  };
}
