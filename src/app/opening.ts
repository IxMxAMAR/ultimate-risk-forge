import { RULES_V1 } from '../domain/ruleset';
import type { ActivityEntry, ForgedCase } from '../domain/types';

// The first two activity lines of every new case (ARCHITECTURE.md §6).
export const openingActivity = (forged: ForgedCase, flagCount: number, now: string): ActivityEntry[] => [
  { ts: now, who: 'Forge', what: `Case ${forged.displayId} opened by the Forge` },
  { ts: now, who: `Rules v${RULES_V1.version}`, what: `Checks ran: ${flagCount} flags raised` },
];
