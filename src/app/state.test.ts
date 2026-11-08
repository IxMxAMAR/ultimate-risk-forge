import { describe, expect, it } from 'vitest';
import { RULES_V1 } from '../domain/ruleset';
import type { Flag } from '../domain/types';
import { newCaseState } from '../persist/db';
import { reducer, type AppAction, type AppState } from './state';

const NOW = '2026-11-08T10:00:00.000Z';
const base = (): AppState => ({
  cases: [newCaseState('PD-009R-HF', true, NOW)], activeCode: 'PD-009R-HF', view: 'console', tab: 'overview',
  selectedFlagId: null, forgeOpen: false, search: '', analyst: 'Sam', persistent: true,
});
const DECISION = { action: 'approve' as const, keep: 0, release: 1_000_000, reviewDate: '2026-11-08' };
const active = (s: AppState) => s.cases[0]!;
const decide = (keep: number) => reducer(base(), {
  type: 'set-decision', decision: { action: 'partial-release', keep, release: 0, reviewDate: '2026-12-08' },
  held: 1_000_000, reason: 'why', trigger: 'early-release', now: NOW,
});

describe('reducer', () => {
  it('logs confirm, dismiss and reopen with the analyst name', () => {
    let s = reducer(base(), { type: 'set-flag-state', id: 'f1', state: 'confirmed', title: 'Rate hidden', now: NOW });
    expect(active(s).flagStates.f1).toEqual({ state: 'confirmed', note: '' });
    expect(active(s).activity.at(-1)).toEqual({ ts: NOW, who: 'Sam', what: 'Sam confirmed “Rate hidden”' });
    s = reducer(s, { type: 'set-flag-state', id: 'f1', state: 'dismissed', title: 'Rate hidden', now: NOW });
    expect(active(s).activity.at(-1)!.what).toBe('Sam dismissed “Rate hidden”');
    s = reducer(s, { type: 'set-flag-state', id: 'f1', state: 'raised', title: 'Rate hidden', now: NOW });
    expect(active(s).activity.at(-1)!.what).toBe('Sam reopened “Rate hidden”');
  });

  it('keeps the note when state changes', () => {
    let s = reducer(base(), { type: 'set-note', id: 'f1', note: 'n' });
    s = reducer(s, { type: 'set-flag-state', id: 'f1', state: 'confirmed', title: 'T', now: NOW });
    expect(active(s).flagStates.f1).toEqual({ state: 'confirmed', note: 'n' });
  });

  it('adds analyst flags as confirmed with unique ids', () => {
    const flag = { id: 'x', kind: 'analyst' as const, severity: 'high' as const, title: 'Mine', why: '', evidence: { tab: 'disputes' as const, ids: [] }, state: 'raised' as const, note: '', addedBy: 'analyst' as const };
    let s = reducer(base(), { type: 'add-analyst-flag', flag, now: NOW });
    s = reducer(s, { type: 'add-analyst-flag', flag, now: NOW });
    expect(active(s).analystFlags.map(f => [f.id, f.state])).toEqual([['analyst-1', 'confirmed'], ['analyst-2', 'confirmed']]);
    expect(active(s).activity.at(-1)!.what).toBe('Sam added a flag: “Mine”');
  });

  it('clamps keep to 0..held and derives release', () => {
    for (const [keep, want] of [[-5, 0], [99_999_999, 1_000_000], [400_000, 400_000]] as const) {
      const d = active(decide(keep)).decision!;
      expect([d.keep, d.release]).toEqual([want, 1_000_000 - want]);
    }
    expect(active(decide(400_000)).overrideReason).toBe('why');
    expect(active(decide(400_000)).activity.at(-1)!.what).toBe('Sam changed the decision to Partial release. Reason recorded.');
  });

  it('logs a decision only when the action or keep changes, and mentions the reason only when there is one', () => {
    const first = decide(400_000);
    const reasonOnly = reducer(first, { type: 'set-decision', decision: active(first).decision!, held: 1_000_000, reason: 'new reason', trigger: 'early-release', now: NOW });
    expect(active(reasonOnly).overrideReason).toBe('new reason');
    expect(active(reasonOnly).activity).toHaveLength(1);
    const noReason = reducer(first, { type: 'set-decision', decision: { action: 'deny', keep: 1_000_000, release: 0, reviewDate: 'd' }, held: 1_000_000, reason: '', trigger: 'early-release', now: NOW });
    expect(active(noReason).activity.at(-1)!.what).toBe('Sam changed the decision to Deny early release.');
  });

  it('non-finite keep falls back to the current keep', () => {
    const s = reducer(decide(300_000), { type: 'set-decision', decision: { action: 'deny', keep: NaN, release: 0, reviewDate: 'd' }, held: 1_000_000, reason: 'r', trigger: 'early-release', now: NOW });
    expect(active(s).decision).toMatchObject({ action: 'deny', keep: 300_000, release: 700_000 });
    const fresh = decide(NaN);
    expect(active(fresh).decision!.keep).toBe(0);
  });

  it('moves flag selection and wraps', () => {
    const ids = ['a', 'b', 'c'];
    let s = reducer(base(), { type: 'move-flag', dir: 1, ids });
    expect(s.selectedFlagId).toBe('a');
    s = reducer(s, { type: 'move-flag', dir: -1, ids });
    expect(s.selectedFlagId).toBe('c');
    s = reducer(s, { type: 'move-flag', dir: 1, ids });
    expect(s.selectedFlagId).toBe('a');
    expect(reducer(base(), { type: 'move-flag', dir: -1, ids }).selectedFlagId).toBe('c');
  });

  it('mark-decided stamps the case and logs two lines', () => {
    const s = reducer(base(), { type: 'mark-decided', now: NOW, score: null, decision: DECISION });
    expect(active(s).decidedAt).toBe(NOW);
    expect(active(s).activity.map(a => a.what)).toEqual(['Sam signed the report.', 'Sam marked the case decided.']);
  });

  it('mark-decided on a decided case changes nothing', () => {
    const once = reducer(base(), { type: 'mark-decided', now: NOW, score: null, decision: DECISION });
    const again = reducer(once, { type: 'mark-decided', now: '2026-11-09T10:00:00.000Z', score: null, decision: DECISION });
    expect(active(again)).toBe(active(once));
  });

  it('mark-decided keeps an existing decision and otherwise stores the one shown', () => {
    expect(active(reducer(base(), { type: 'mark-decided', now: NOW, score: null, decision: DECISION })).decision).toEqual(DECISION);
    const own = decide(400_000);
    expect(active(reducer(own, { type: 'mark-decided', now: NOW, score: null, decision: DECISION })).decision).toBe(active(own).decision);
  });

  it('ignores every edit once the case is decided', () => {
    const flag = { id: 'x', kind: 'analyst' as const, severity: 'high' as const, title: 'Mine', why: '', evidence: { tab: 'disputes' as const, ids: [] }, state: 'raised' as const, note: '', addedBy: 'analyst' as const };
    const done = reducer(decide(400_000), { type: 'mark-decided', now: NOW, score: null, decision: DECISION });
    for (const a of [
      { type: 'set-flag-state', id: 'f1', state: 'confirmed', title: 'T', now: NOW },
      { type: 'set-note', id: 'f1', note: 'n' },
      { type: 'add-analyst-flag', flag, now: NOW },
      { type: 'set-decision', decision: { action: 'deny', keep: 1_000_000, release: 0, reviewDate: 'd' }, held: 1_000_000, reason: 'r', trigger: 'early-release', now: NOW },
      { type: 'set-seller-message', text: 'x' },
      { type: 'set-message-read', read: true },
      { type: 'set-second-reviewer', name: 'Kim' },
    ] as const) expect(active(reducer(done, a))).toBe(active(done));
  });

  it('rounds keep to whole cents', () => {
    expect(active(decide(400_000.4)).decision).toMatchObject({ keep: 400_000, release: 600_000 });
  });

  it('opens cases and ignores unknown codes', () => {
    const s = { ...base(), view: 'report' as const, selectedFlagId: 'a', tab: 'owners' as const };
    expect(reducer(s, { type: 'open-case', code: 'PD-009R-HF' })).toMatchObject({ view: 'console', tab: 'disputes', selectedFlagId: null });
    expect(reducer(s, { type: 'open-case', code: 'NOPE' })).toBe(s);
  });

  describe('playbook', () => {
    const step = (s: AppState, over: Partial<Extract<AppAction, { type: 'answer-step' }>> = {}) => reducer(s, {
      type: 'answer-step', answers: { jump: ['a'] }, flagStates: { hidden: 'confirmed', 'analyst-1': 'dismissed' }, line: 'Sam answered “Q”: A', now: NOW, ...over,
    });

    it('stores answers, applies rule flag states, keeps notes and logs one line', () => {
      const analyst: Flag = { id: 'analyst-1', kind: 'analyst', severity: 'high', title: 'T', why: '', evidence: { tab: 'disputes', ids: [] }, state: 'confirmed', note: '', addedBy: 'analyst' };
      let s = reducer(base(), { type: 'set-note', id: 'hidden', note: 'n' });
      s = { ...s, cases: [{ ...active(s), analystFlags: [analyst] }] };
      s = step(s);
      expect(active(s).playbook).toEqual({ answers: { jump: ['a'] }, collapsed: false });
      expect(active(s).flagStates.hidden).toEqual({ state: 'confirmed', note: 'n' });
      expect(active(s).flagStates['analyst-1']).toBeUndefined();
      expect(active(s).analystFlags[0]!.state).toBe('confirmed');
      expect(active(s).activity).toEqual([{ ts: NOW, who: 'Sam', what: 'Sam answered “Q”: A' }]);
    });

    it('logs nothing when the line is null and keeps the collapsed flag', () => {
      let s = reducer(base(), { type: 'set-playbook-collapsed', collapsed: true });
      s = step(s, { line: null });
      expect(active(s).playbook).toEqual({ answers: { jump: ['a'] }, collapsed: true });
      expect(active(s).activity).toEqual([]);
    });

    it('persists the collapsed flag', () => {
      const s = reducer(base(), { type: 'set-playbook-collapsed', collapsed: true });
      expect(active(s).playbook).toEqual({ answers: {}, collapsed: true });
    });

    it('ignores both actions once decided', () => {
      const decided = reducer(base(), { type: 'mark-decided', now: NOW, score: null, decision: DECISION });
      expect(step(decided)).toEqual(decided);
      expect(reducer(decided, { type: 'set-playbook-collapsed', collapsed: true })).toEqual(decided);
    });

    it('stores the rules version when decided', () => {
      const decided = reducer(base(), { type: 'mark-decided', now: NOW, score: null, decision: DECISION });
      expect(active(decided).rulesVersion).toBe(RULES_V1.version);
      expect(RULES_V1.version).toBe('1.1');
    });
  });
});
