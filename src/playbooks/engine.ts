import type { CaseView } from '../app/derive';
import type { FlagKind } from '../domain/types';
import type { Answer, FlagEffects, FlagStateMap, PathCompareRow, Playbook, PlaybookAnswers, Step, StepStatus, StepView, Walk } from './types';

const skipped = (s: Step, v: CaseView, answers: PlaybookAnswers) => !!s.when && !s.when(v, answers);
const kindsOf = (e: FlagEffects) => Object.keys(e) as FlagKind[];
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));

export const labelsOf = (answers: Answer[], ids: string[]): string => {
  const names = ids.map(id => answers.find(a => a.id === id)?.label ?? id);
  return names.length ? names.join(', ') : '—';
};

// Chosen answers decide the flags; every other kind the step could touch is dismissed (ARCHITECTURE.md §5).
export function effectsOf(step: Step, v: CaseView, chosen: string[]): FlagEffects {
  const all = step.answers(v);
  const picked = all.filter(a => chosen.includes(a.id));
  if (picked.some(a => a.neutral)) return {};
  const out: FlagEffects = {};
  for (const a of picked) Object.assign(out, a.sets);
  for (const a of all) for (const k of kindsOf(a.sets ?? {})) if (!out[k]) out[k] = 'dismissed';
  return out;
}

export function walk(pb: Playbook, v: CaseView, answers: PlaybookAnswers): Walk {
  let currentSeen = false;
  const steps: StepView[] = pb.steps.map(step => {
    const chosen = answers[step.id] ?? [];
    let status: StepStatus;
    if (skipped(step, v, answers)) status = 'skipped';
    else if (answers[step.id]) status = 'done';
    else if (!currentSeen) { status = 'current'; currentSeen = true; } else status = 'upcoming';
    const drift = status === 'done' && Object.entries(effectsOf(step, v, chosen)).some(([kind, state]) => v.flags.some(f => f.id === kind && f.state !== state));
    return { step, status, chosen, answers: step.answers(v), lookAt: step.lookAt(v), drift };
  });
  const live = steps.filter(s => s.status !== 'skipped');
  return { steps, current: steps.find(s => s.status === 'current') ?? null, done: !currentSeen, answered: live.filter(s => s.status === 'done').length, total: live.length };
}

export function answerStep(pb: Playbook, v: CaseView, answers: PlaybookAnswers, stepId: string, chosen: string[]): { answers: PlaybookAnswers; flagStates: FlagStateMap } {
  const next: PlaybookAnswers = { ...answers, [stepId]: chosen };
  const from = pb.steps.findIndex(s => s.id === stepId);
  const own = pb.steps[from];
  const withdrawn: Step[] = own && answers[stepId] ? [own] : [];
  for (const step of pb.steps.slice(from + 1)) {
    if (skipped(step, v, next) && next[step.id]) { delete next[step.id]; withdrawn.push(step); }
  }
  const exists = (kind: string) => v.flags.some(f => f.id === kind);
  const stillSet = new Set<FlagKind>();
  for (const step of pb.steps) if (next[step.id]) kindsOf(effectsOf(step, v, next[step.id]!)).forEach(k => stillSet.add(k));
  // A replaced or cleared answer's flag goes back to raised only if no remaining answer sets it and the analyst has not changed it since (ARCHITECTURE.md §5).
  const flagStates: FlagStateMap = {};
  for (const step of withdrawn) {
    for (const [k, state] of Object.entries(effectsOf(step, v, answers[step.id] ?? []))) {
      if (!stillSet.has(k as FlagKind) && v.flags.find(f => f.id === k)?.state === state) flagStates[k] = 'raised';
    }
  }
  if (own) for (const [k, state] of Object.entries(effectsOf(own, v, chosen))) if (exists(k)) flagStates[k] = state;
  return { answers: next, flagStates };
}

export function expectedPath(pb: Playbook, v: CaseView): PlaybookAnswers {
  const answers: PlaybookAnswers = {};
  for (let w = walk(pb, v, answers); w.current; w = walk(pb, v, answers)) answers[w.current.step.id] = w.current.step.expected(v);
  return answers;
}

// One row per step the analyst walked or the expected path walked; the bar and the practice result both render these (ARCHITECTURE.md §6).
export function comparePath(w: Walk, expected: PlaybookAnswers): PathCompareRow[] {
  return w.steps.filter(s => s.status !== 'skipped' || s.step.id in expected).map(s => {
    const want = expected[s.step.id];
    const yours = s.status === 'skipped' ? undefined : s.chosen;
    return {
      stepId: s.step.id, title: s.step.title,
      yours: yours ? labelsOf(s.answers, yours) : 'skipped', expected: want ? labelsOf(s.answers, want) : 'skipped',
      ok: !!yours && !!want && sameSet(yours, want),
    };
  });
}
