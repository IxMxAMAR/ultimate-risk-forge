import { deriveCase, type CaseView } from '../app/derive';
import { suggestDecision } from '../checks/suggest';
import { RULES_V1 } from '../domain/ruleset';
import { newCaseState, type CaseState } from '../persist/db';
import { answerStep, comparePath, effectsOf, expectedPath, walk } from './engine';
import { HIDDEN_BY_GROWTH } from './hiddenByGrowth';
import type { Playbook, PlaybookAnswers, Step } from './types';

const ts = '2026-01-01T00:00:00.000Z';
const view = (flagStates: Parameters<typeof deriveCase>[0]['flagStates'] = {}): CaseView =>
  deriveCase({ ...newCaseState('PD-009R-HF', false, ts), flagStates }, RULES_V1);

const a: Step = {
  id: 'a', title: 'A', question: 'Young?', why: '', lookAt: () => [],
  answers: () => [
    { id: 'yes', label: 'Yes', detail: '', sets: { 'young-account-fast-growth': 'confirmed' } },
    { id: 'no', label: 'No', detail: '', sets: { 'young-account-fast-growth': 'dismissed' } },
  ],
  expected: () => ['yes'],
};
const b: Step = {
  id: 'b', title: 'B', question: 'Brands?', why: '', multi: true, lookAt: () => [],
  when: (_v, ans) => !ans['a'] || ans['a'][0] === 'yes',
  answers: () => [
    { id: 'mc', label: 'MC', detail: '', sets: { 'mc-over-limit': 'confirmed' } },
    { id: 'visa', label: 'Visa', detail: '', sets: { 'visa-over-limit': 'confirmed' } },
    { id: 'none', label: 'None', detail: '', exclusive: true, sets: { 'mc-over-limit': 'dismissed', 'visa-over-limit': 'dismissed' } },
    { id: 'thin', label: 'Too thin', detail: '', exclusive: true, neutral: true },
  ],
  expected: () => ['mc'],
};
const c: Step = { id: 'c', title: 'C', question: 'Note', why: '', lookAt: () => [], answers: () => [{ id: 'ok', label: 'OK', detail: '' }], expected: () => ['ok'] };
const pb: Playbook = { id: 't', version: '1', caseType: 'hidden-by-growth', title: 'T', steps: [a, b, c], ending: (v, rules) => suggestDecision(v.forged, v.flags, v.exposure, rules) };

describe('playbook engine', () => {
  const v = view();

  it('walks to the first open step and counts non-skipped steps', () => {
    const w = walk(pb, v, {});
    expect(w.current?.step.id).toBe('a');
    expect(w.total).toBe(3);
    const w2 = walk(pb, v, { a: ['no'] });
    expect(w2.steps.map(s => s.status)).toEqual(['done', 'skipped', 'current']);
    expect(w2.current?.step.id).toBe('c');
    expect(w2.total).toBe(2);
    expect(w2.answered).toBe(1);
  });

  it('derives flag effects from the chosen answers', () => {
    expect(effectsOf(b, v, ['none'])).toEqual({ 'mc-over-limit': 'dismissed', 'visa-over-limit': 'dismissed' });
    expect(effectsOf(b, v, ['mc'])).toEqual({ 'mc-over-limit': 'confirmed', 'visa-over-limit': 'dismissed' });
    expect(effectsOf(b, v, ['thin'])).toEqual({});
  });

  it('re-raises flags of a step that becomes skipped', () => {
    const set = (state: 'confirmed' | 'dismissed') => ({ state, note: '' });
    const live = view({ 'young-account-fast-growth': set('confirmed'), 'mc-over-limit': set('confirmed'), 'visa-over-limit': set('dismissed') });
    const r = answerStep(pb, live, { a: ['yes'], b: ['mc'] }, 'a', ['no']);
    expect(r.answers).toEqual({ a: ['no'] });
    expect(r.flagStates['mc-over-limit']).toBe('raised');
    expect(r.flagStates['visa-over-limit']).toBe('raised');
    expect(r.flagStates['young-account-fast-growth']).toBe('dismissed');
  });

  it('flags drift when a flag no longer matches the answer', () => {
    const dismissed = view({ 'young-account-fast-growth': { state: 'dismissed', note: '' } });
    expect(walk(pb, dismissed, { a: ['yes'] }).steps[0]?.drift).toBe(true);
  });

  it('expected path answers every non-skipped step', () => {
    expect(expectedPath(pb, v)).toEqual({ a: ['yes'], b: ['mc'], c: ['ok'] });
  });

  it('compares your path with the expected one, row by row', () => {
    const rows = comparePath(walk(pb, v, { a: ['no'] }), { a: ['yes'], b: ['mc'], c: ['ok'] });
    expect(rows).toEqual([
      { stepId: 'a', title: 'A', yours: 'No', expected: 'Yes', ok: false },
      { stepId: 'b', title: 'B', yours: 'skipped', expected: 'MC', ok: false },
      { stepId: 'c', title: 'C', yours: '—', expected: 'OK', ok: false },
    ]);
    const same = comparePath(walk(pb, v, { a: ['yes'], b: ['mc'], c: ['ok'] }), { a: ['yes'], b: ['mc'], c: ['ok'] });
    expect(same.every(r => r.ok)).toBe(true);
    expect(comparePath(walk(pb, v, { a: ['no'], c: ['ok'] }), { a: ['no'], c: ['ok'] }).map(r => r.stepId)).toEqual(['a', 'c']);
    expect(comparePath(walk(pb, v, { a: ['yes'], b: ['mc', 'visa'], c: ['ok'] }), { a: ['yes'], b: ['visa', 'mc'], c: ['ok'] })[1]).toMatchObject({ yours: 'MC, Visa', ok: true });
  });
});

describe('withdrawing a replaced answer (Hidden by growth, PD-009R-HF)', () => {
  const CODE = 'PD-009R-HF';
  const apply = (steps: [string, string[]][]) => {
    let answers: PlaybookAnswers = {};
    const flagStates: CaseState['flagStates'] = {};
    const derive = () => deriveCase({ ...newCaseState(CODE, false, ts), flagStates: { ...flagStates } }, RULES_V1);
    const give = (id: string, chosen: string[]) => {
      const r = answerStep(HIDDEN_BY_GROWTH, derive(), answers, id, chosen);
      answers = r.answers;
      for (const [k, state] of Object.entries(r.flagStates)) flagStates[k] = { state, note: '' };
    };
    for (const [id, chosen] of steps) give(id, chosen);
    const state = (k: string) => derive().flags.find(f => f.id === k)?.state;
    return { give, state, flagStates, answers: () => answers, direct: (k: string, s: 'raised' | 'confirmed' | 'dismissed') => { flagStates[k] = { state: s, note: '' }; } };
  };

  it('returns a brand flag to raised when the new brands answer no longer sets it', () => {
    const p = apply([['jump', ['yes']], ['hidden', ['no']], ['brands', ['mc3']]]);
    expect(p.state('mc-over-limit')).toBe('confirmed');
    p.give('brands', ['thin']);
    expect(p.state('mc-over-limit')).toBe('raised');
    expect(p.state('visa-over-limit')).toBe('raised');
  });

  it('keeps the brand that is still chosen and settles the one that was dropped', () => {
    const p = apply([['jump', ['yes']], ['hidden', ['no']], ['brands', ['mc3', 'visa']]]);
    p.give('brands', ['visa']);
    expect(p.state('visa-over-limit')).toBe('confirmed');
    expect(p.state('mc-over-limit')).toBe('dismissed');
  });

  it('leaves a flag the analyst changed directly when a cascade clears its step', () => {
    const p = apply([['jump', ['yes']], ['hidden', ['yes']]]);
    expect(p.state('rate-hidden-by-growth')).toBe('confirmed');
    p.direct('rate-hidden-by-growth', 'dismissed');
    p.give('jump', ['no']);
    expect(p.state('rate-hidden-by-growth')).toBe('dismissed');
    expect(Object.keys(p.answers())).toEqual(['jump']);
  });

  it('raises a flag when its cleared step set it and nothing changed it', () => {
    const p = apply([['jump', ['yes']], ['hidden', ['yes']]]);
    p.give('jump', ['no']);
    expect(p.state('rate-hidden-by-growth')).toBe('raised');
  });
});
