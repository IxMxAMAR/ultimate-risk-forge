import { actionLabel } from '../domain/labels';
import type { ActivityEntry, DataTab, Decision, Flag, Trigger } from '../domain/types';
import type { CaseState } from '../persist/db';
import type { Score } from '../practice/score';

export interface AppState {
  cases: CaseState[]; activeCode: string | null; view: 'console' | 'report'; tab: DataTab;
  selectedFlagId: string | null; forgeOpen: boolean; search: string; analyst: string; persistent: boolean;
}

export type AppAction =
  | { type: 'loaded'; cases: CaseState[]; analyst: string; persistent: boolean }
  | { type: 'open-case'; code: string }
  | { type: 'add-case'; state: CaseState }
  | { type: 'set-view'; view: AppState['view'] }
  | { type: 'set-tab'; tab: DataTab }
  | { type: 'select-flag'; id: string | null }
  | { type: 'move-flag'; dir: 1 | -1; ids: string[] }
  | { type: 'set-flag-state'; id: string; state: Flag['state']; title: string; now: string }
  | { type: 'set-note'; id: string; note: string }
  | { type: 'add-analyst-flag'; flag: Flag; now: string }
  | { type: 'set-decision'; decision: Decision; held: number; reason: string; trigger: Trigger['kind']; now: string }
  | { type: 'set-seller-message'; text: string }
  | { type: 'set-message-read'; read: boolean }
  | { type: 'set-second-reviewer'; name: string }
  | { type: 'mark-decided'; now: string; score: Score | null }
  | { type: 'forge-open'; open: boolean }
  | { type: 'set-search'; text: string }
  | { type: 'set-analyst'; name: string };

const VERB: Record<Flag['state'], string> = { confirmed: 'confirmed', dismissed: 'dismissed', raised: 'reopened' };

// Applies `fn` to the active case only; an unknown or missing active code leaves the state untouched.
function onActive(s: AppState, fn: (c: CaseState) => CaseState): AppState {
  if (!s.cases.some(c => c.code === s.activeCode)) return s;
  return { ...s, cases: s.cases.map(c => (c.code === s.activeCode ? fn(c) : c)) };
}

const log = (c: CaseState, who: string, ts: string, ...lines: string[]): ActivityEntry[] =>
  [...c.activity, ...lines.map(what => ({ ts, who, what }))];

export function reducer(s: AppState, a: AppAction): AppState {
  switch (a.type) {
    case 'loaded': return { ...s, cases: a.cases, analyst: a.analyst, persistent: a.persistent };
    case 'open-case':
      if (!s.cases.some(c => c.code === a.code)) return s;
      return { ...s, activeCode: a.code, view: 'console', tab: 'disputes', selectedFlagId: null };
    case 'add-case': return { ...s, cases: [...s.cases.filter(c => c.code !== a.state.code), a.state] };
    case 'set-view': return { ...s, view: a.view };
    case 'set-tab': return { ...s, tab: a.tab };
    case 'select-flag': return { ...s, selectedFlagId: a.id };
    case 'move-flag': {
      if (a.ids.length === 0) return s;
      const at = s.selectedFlagId === null ? -1 : a.ids.indexOf(s.selectedFlagId);
      const next = at === -1 ? (a.dir === 1 ? 0 : a.ids.length - 1) : (at + a.dir + a.ids.length) % a.ids.length;
      return { ...s, selectedFlagId: a.ids[next] ?? null };
    }
    case 'set-flag-state':
      return onActive(s, c => {
        const activity = log(c, s.analyst, a.now, `${s.analyst} ${VERB[a.state]} “${a.title}”`);
        if (c.analystFlags.some(f => f.id === a.id)) {
          return { ...c, analystFlags: c.analystFlags.map(f => (f.id === a.id ? { ...f, state: a.state } : f)), activity };
        }
        return { ...c, flagStates: { ...c.flagStates, [a.id]: { state: a.state, note: c.flagStates[a.id]?.note ?? '' } }, activity };
      });
    case 'set-note':
      return onActive(s, c => {
        if (c.analystFlags.some(f => f.id === a.id)) {
          return { ...c, analystFlags: c.analystFlags.map(f => (f.id === a.id ? { ...f, note: a.note } : f)) };
        }
        return { ...c, flagStates: { ...c.flagStates, [a.id]: { state: c.flagStates[a.id]?.state ?? 'raised', note: a.note } } };
      });
    case 'add-analyst-flag':
      return onActive(s, c => {
        const flag: Flag = { ...a.flag, id: `analyst-${c.analystFlags.length + 1}`, state: 'confirmed', addedBy: 'analyst' };
        return { ...c, analystFlags: [...c.analystFlags, flag], activity: log(c, s.analyst, a.now, `${s.analyst} added a flag: “${flag.title}”`) };
      });
    case 'set-decision':
      return onActive(s, c => {
        const requested = Number.isFinite(a.decision.keep) ? a.decision.keep : c.decision?.keep ?? 0;
        const keep = Math.min(a.held, Math.max(0, requested));
        const decision: Decision = { ...a.decision, keep, release: a.held - keep };
        const changed = c.decision === null || c.decision.action !== decision.action || c.decision.keep !== decision.keep;
        const line = `${s.analyst} changed the decision to ${actionLabel(decision.action, a.trigger)}.${a.reason.trim() === '' ? '' : ' Reason recorded.'}`;
        return { ...c, decision, overrideReason: a.reason, activity: changed ? log(c, s.analyst, a.now, line) : c.activity };
      });
    case 'set-seller-message': return onActive(s, c => ({ ...c, sellerMessage: a.text }));
    case 'set-message-read': return onActive(s, c => ({ ...c, messageRead: a.read }));
    case 'set-second-reviewer': return onActive(s, c => ({ ...c, secondReviewer: a.name }));
    case 'mark-decided':
      return onActive(s, c => (c.decidedAt !== null ? c : {
        ...c, decidedAt: a.now, score: a.score,
        activity: log(c, s.analyst, a.now, `${s.analyst} signed the report.`, `${s.analyst} marked the case decided.`),
      }));
    case 'forge-open': return { ...s, forgeOpen: a.open };
    case 'set-search': return { ...s, search: a.text };
    case 'set-analyst': return { ...s, analyst: a.name };
  }
}
