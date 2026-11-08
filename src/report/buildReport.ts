import { coverage, type ExposureRow } from '../checks/exposure';
import { rulesVersionOf, type CaseView } from '../app/derive';
import { RULES_V1, type Ruleset } from '../domain/ruleset';
import { actionLabel } from '../domain/labels';
import type { ActivityEntry, Decision, Flag } from '../domain/types';
import type { CaseState } from '../persist/db';
import { formatDay } from '../lib/dates';
import { formatMoney, type Cents } from '../lib/money';
import { effectsOf, labelsOf, walk } from '../playbooks/engine';
import { practiceOpen } from '../practice/open';
import { consistency, REFERENCE_DECISIONS, type PastDecision } from './consistency';
import { conditions, fallback, FIX_TEXT, howEstimated, letter } from './templates';

export interface ReportModel {
  header: { title: string; subtitle: string; caseId: string; date: string; analyst: string; rules: string; status: 'Decided' | 'Draft'; data: 'Fictional (Forge)' };
  recommendation: { label: string; release: Cents; keep: Cents; reviewDate: string; confidence: 'high' | 'medium'; override: null | { suggested: string; reason: string } };
  findings: { confirmed: Flag[]; dismissed: Flag[]; toReview: Flag[] };
  money: { rows: ExposureRow[]; low: Cents; high: Cents; keep: Cents; held: Cents; covers: boolean; bufferPct: number; howEstimated: string };
  conditions: string[]; fallback: string; message: string;
  fix: { text: string; affected: number };
  audit: ActivityEntry[]; attachments: { title: string; page: number }[];
  path: { question: string; answer: string; sets: string[]; drift: boolean }[]; pathConclusion: string | null;
  consistency: { past: PastDecision[]; current: { ref: string; keptPct: number }; median: number; inLine: boolean; range: [number, number] };
  footer: string;
}

export const sellerMessage = (v: CaseView, d: Decision, rules: Ruleset = RULES_V1): string => letter(v, d, rules);

// See ARCHITECTURE.md §5: the report is built from the case view and the analyst's saved state.
export function buildReport(v: CaseView, cs: CaseState, analyst: string, rules: Ruleset): ReportModel {
  const { forged, exposure, suggestion } = v;
  const held = forged.trigger.heldAmount;
  const d: Decision = cs.decision ?? suggestion;
  // While critical or high flags are open no release is suggested, so there is nothing to override (ARCHITECTURE.md §4).
  const overridden = cs.decision !== null && v.reviewFirst === 0 && (cs.decision.action !== suggestion.action || cs.decision.keep !== suggestion.keep);
  const keptPct = Math.round(d.keep / held * 100);
  const hidden = practiceOpen(cs);
  const rulesVersion = rulesVersionOf(cs, rules);
  const played = v.playbook ? walk(v.playbook, v, cs.playbook?.answers ?? {}) : null;
  const path = played
    ? played.steps.filter(s => s.status === 'done').map(s => ({
      question: s.step.question, answer: labelsOf(s.answers, s.chosen), drift: s.drift,
      sets: Object.entries(effectsOf(s.step, v, s.chosen)).flatMap(([kind, state]) => {
        const title = v.flags.find(f => f.id === kind)?.title;
        return title ? [`${state === 'confirmed' ? 'Confirmed' : 'Dismissed'}: ${title}`] : [];
      }),
    }))
    : [];
  const past = REFERENCE_DECISIONS[forged.actualType] ?? [];

  return {
    header: {
      title: `${forged.subject.name} — early hold release`,
      subtitle: `The seller asked us to release a ${formatMoney(held)} fixed hold before its scheduled date.`,
      caseId: forged.displayId, date: formatDay(forged.asOf), analyst, rules: `v${rulesVersion}`,
      status: cs.decidedAt ? 'Decided' : 'Draft', data: 'Fictional (Forge)',
    },
    recommendation: {
      label: actionLabel(d.action, forged.trigger.kind), release: d.release, keep: d.keep, reviewDate: d.reviewDate,
      confidence: v.flags.some(f => f.state === 'raised') ? 'medium' : 'high',
      override: overridden ? { suggested: suggestion.summary, reason: cs.overrideReason } : null,
    },
    findings: { confirmed: v.flags.filter(f => f.state === 'confirmed'), dismissed: v.flags.filter(f => f.state === 'dismissed'), toReview: v.flags.filter(f => f.state === 'raised') },
    money: {
      rows: exposure.rows, low: exposure.low, high: exposure.high, keep: d.keep, held,
      ...coverage(d.keep, Math.min(exposure.high, held)), howEstimated: howEstimated(v, rules),
    },
    conditions: conditions(v), fallback: fallback(d.reviewDate),
    message: cs.sellerMessage ?? sellerMessage(v, d, rules),
    fix: { text: FIX_TEXT, affected: forged.policyAffectedEstimate },
    audit: cs.activity,
    attachments: [
      { title: 'Chart · dispute rate by month', page: 2 },
      { title: 'Table · rates by card brand', page: 2 },
      { title: `Table · all ${forged.disputes.length} disputes`, page: 3 },
      { title: 'Money-at-risk workings', page: 3 },
      ...forged.docs.map(doc => ({ title: doc.title, page: 4 })),
    ],
    path, pathConclusion: played?.done && !hidden && v.reviewFirst === 0 ? suggestion.summary : null,
    consistency: {
      past, current: { ref: forged.displayId, keptPct },
      ...(past.length ? consistency({ action: d.action, keptPct }, past) : { median: NaN, inLine: true, range: [keptPct, keptPct] as [number, number] }),
    },
    footer: `${forged.displayId} · Generated by Risk Forge · Rules v${rulesVersion}`,
  };
}
