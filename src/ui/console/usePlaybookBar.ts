import { useMemo, useState } from 'react';
import { activeOf, useApp } from '../../app/AppContext';
import { answerStep, expectedPath, labelsOf, walk } from '../../playbooks/engine';
import type { FlagStateMap, LookAt, PlaybookAnswers, StepView, Walk } from '../../playbooks/types';
import { practiceOpen } from '../../practice/open';
import { useShortcuts } from '../useShortcuts';
import { toggle, type PlaybookBarProps } from './PlaybookBar';

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));

// A reopened step is the current one until it is answered; the step that was current waits as upcoming.
function reopened(w: Walk, id: string | null): Walk {
  const at = w.steps.findIndex(s => s.step.id === id && s.status === 'done');
  if (at === -1) return w;
  const steps: StepView[] = w.steps.map((s, i) => (i === at ? { ...s, status: 'current' } : s.status === 'current' ? { ...s, status: 'upcoming' } : s));
  return { ...w, steps, current: steps[at] ?? null, done: false };
}

// Everything the console adds around the playbook bar: reopening, multi-select picks, look-at highlights, Accept-all and the practice gate (ARCHITECTURE.md §5, §6).
export function usePlaybookBar(): PlaybookBarProps | null {
  const { state, dispatch, view } = useApp();
  const cs = activeOf(state);
  const [editing, setEditing] = useState<string | null>(null);
  const [pick, setPick] = useState<{ step: string; ids: string[] }>({ step: '', ids: [] });
  const pb = view?.playbook ?? null;
  const decided = cs !== null && cs.decidedAt !== null;
  const hidden = cs !== null && practiceOpen(cs);
  const answers: PlaybookAnswers = cs?.playbook?.answers ?? {};
  const expected = useMemo(() => (pb && view && !hidden ? expectedPath(pb, view) : null), [pb, view, hidden]);

  const base = pb && view ? walk(pb, view, answers) : null;
  // A reopened step that is no longer done (a cascade cleared it) is forgotten.
  if (editing !== null && !base?.steps.some(s => s.step.id === editing && s.status === 'done')) setEditing(null);
  const w = base ? reopened(base, editing) : null;
  const current = w?.current ?? null;
  const picked = current ? (pick.step === current.step.id ? pick.ids : current.chosen) : [];
  const now = () => new Date().toISOString();
  const said = (sv: StepView, chosen: string[]) => `${state.analyst} answered “${sv.step.question}”: ${labelsOf(sv.answers, chosen)}`;

  const answer = (stepId: string, chosen: string[]) => {
    if (!pb || !view || !cs || !w || decided) return;
    setEditing(null);
    setPick({ step: '', ids: [] });
    const sv = w.steps.find(s => s.step.id === stepId);
    const stored = answers[stepId];
    const same = !!stored && sameSet(stored, chosen);
    if (!sv || (same && !sv.drift)) return;
    const next = answerStep(pb, view, answers, stepId, chosen);
    dispatch({ type: 'answer-step', answers: next.answers, flagStates: next.flagStates, lines: same ? [] : [said(sv, chosen)], now: now() });
  };

  const acceptAll = () => {
    if (!pb || !view || decided || hidden) return;
    setEditing(null);
    setPick({ step: '', ids: [] });
    let at = answers;
    const flagStates: FlagStateMap = {};
    const lines: string[] = [];
    for (let step = walk(pb, view, at).current; step; step = walk(pb, view, at).current) {
      const chosen = step.step.expected(view);
      const next = answerStep(pb, view, at, step.step.id, chosen);
      at = next.answers;
      Object.assign(flagStates, next.flagStates);
      lines.push(said(step, chosen));
    }
    if (lines.length > 0) dispatch({ type: 'answer-step', answers: at, flagStates, lines, now: now() });
  };

  const look = (l: LookAt) => {
    dispatch({ type: 'set-tab', tab: l.tab });
    dispatch({ type: 'set-look', ids: l.ids });
    l.ids.map(id => document.querySelector(`[data-evidence-id="${id}"]`)).find(el => el !== null)?.scrollIntoView?.({ block: 'center' });
  };

  const useDecision = () => {
    if (!view || decided) return;
    const { action, keep, reviewDate } = view.suggestion;
    const held = view.forged.trigger.heldAmount;
    dispatch({ type: 'set-decision', decision: { action, keep, release: held - keep, reviewDate }, held, reason: '', trigger: view.forged.trigger.kind, now: now() });
  };

  const open = !!current && !decided && !state.forgeOpen && !(cs?.playbook?.collapsed ?? false);
  const key = (n: number) => () => {
    const option = current?.answers[n];
    if (!open || !current || !option) return;
    if (current.step.multi) setPick({ step: current.step.id, ids: toggle(current.answers, picked, option.id) });
    else answer(current.step.id, [option.id]);
  };
  useShortcuts({
    1: key(0), 2: key(1), 3: key(2), 4: key(3),
    enter: () => {
      if (!open || !current?.step.multi || picked.length === 0 || document.activeElement?.closest('button, a')) return false;
      answer(current.step.id, picked);
    },
  });

  if (!pb || !view || !cs || !w) return null;
  return {
    title: pb.title, walk: w, collapsed: cs.playbook?.collapsed ?? false, readOnly: decided, picked,
    showData: !hidden, expected, conclusion: hidden ? null : view.suggestion, compare: cs.practice && decided,
    onPick: ids => current && setPick({ step: current.step.id, ids }),
    onAnswer: answer, onReopen: id => { if (!decided) setEditing(id); }, onLook: look, onAcceptAll: acceptAll, onUseDecision: useDecision,
    onCollapse: collapsed => dispatch({ type: 'set-playbook-collapsed', collapsed }),
  };
}
