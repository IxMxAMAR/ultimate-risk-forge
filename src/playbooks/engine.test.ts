import { deriveCase, type CaseView } from '../app/derive';
import { RULES_V1 } from '../domain/ruleset';
import { newCaseState } from '../persist/db';
import { answerStep, effectsOf, expectedPath, walk } from './engine';
import type { Playbook, Step } from './types';

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
const pb: Playbook = { id: 't', version: '1', caseType: 'hidden-by-growth', title: 'T', steps: [a, b, c], ending: v => v.suggestion };

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
    const r = answerStep(pb, v, { a: ['yes'], b: ['mc'] }, 'a', ['no']);
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
});
