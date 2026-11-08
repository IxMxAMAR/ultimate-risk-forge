import type { CaseTypeId } from '../domain/types';
import { HIDDEN_BY_GROWTH } from './hiddenByGrowth';
import type { Playbook } from './types';

export const playbookFor = (type: CaseTypeId): Playbook | null => (type === 'hidden-by-growth' ? HIDDEN_BY_GROWTH : null);
