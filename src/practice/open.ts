import type { CaseState } from '../persist/db';

// A practice case that is not decided yet: the rules' suggestion, the expected path and the consistency check stay hidden (ARCHITECTURE.md §6).
export const practiceOpen = (cs: CaseState): boolean => cs.practice && cs.decidedAt === null;
