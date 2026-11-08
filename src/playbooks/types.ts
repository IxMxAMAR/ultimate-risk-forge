import type { Ruleset } from '../domain/ruleset';
import type { CaseTypeId, DataTab, Flag, FlagKind } from '../domain/types';
import type { CaseView } from '../app/derive';
import type { Suggestion } from '../checks/suggest';

export type PlaybookAnswers = Record<string, string[]>;
export interface LookAt { label: string; tab: DataTab; ids: string[] }
export type FlagEffects = Partial<Record<FlagKind, 'confirmed' | 'dismissed'>>;
export interface Answer { id: string; label: string; detail: string; sets?: FlagEffects; exclusive?: boolean; neutral?: boolean }
export interface Step {
  id: string; title: string; question: string; why: string; multi?: boolean;
  lookAt(v: CaseView): LookAt[];
  answers(v: CaseView): Answer[];
  when?(v: CaseView, answers: PlaybookAnswers): boolean;
  expected(v: CaseView): string[];
}
export interface Playbook { id: string; version: string; caseType: CaseTypeId; title: string; steps: Step[]; ending(v: CaseView, rules: Ruleset): Suggestion }
export type StepStatus = 'done' | 'current' | 'upcoming' | 'skipped';
export interface StepView { step: Step; status: StepStatus; chosen: string[]; answers: Answer[]; lookAt: LookAt[]; drift: boolean }
export interface Walk { steps: StepView[]; current: StepView | null; done: boolean; answered: number; total: number }
export type FlagStateMap = Record<string, Flag['state']>;
export interface PathCompareRow { stepId: string; title: string; yours: string; expected: string; ok: boolean }
