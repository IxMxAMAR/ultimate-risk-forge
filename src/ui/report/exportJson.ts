import type { CaseView } from '../../app/derive';
import { RULES_V1 } from '../../domain/ruleset';
import type { CaseState } from '../../persist/db';
import type { ReportModel } from '../../report/buildReport';

// The exported file holds the analyst's decision (or the one the report shows), the flags and the report model; an undecided practice case leaves out consistency and pathConclusion (ARCHITECTURE.md §6).
export function exportCaseJson(v: CaseView, cs: CaseState, report: ReportModel): string {
  const { action, keep, release, reviewDate } = cs.decision ?? v.suggestion;
  const { consistency, pathConclusion, ...shown } = report;
  const open = cs.practice && cs.decidedAt === null;
  return JSON.stringify({
    code: cs.code, displayId: v.forged.displayId, rulesVersion: cs.rulesVersion ?? RULES_V1.version,
    decision: { action, keep, release, reviewDate }, flags: v.flags, report: open ? shown : report,
  }, null, 2);
}

// Saves text as a local file; a browser without object URLs does nothing.
export function downloadText(name: string, text: string): void {
  if (typeof URL.createObjectURL !== 'function') return;
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
