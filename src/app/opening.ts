import { disputeStats } from '../checks/disputeMath';
import { runChecks } from '../checks/flags';
import { RULES_V1 } from '../domain/ruleset';
import type { ActivityEntry, ForgedCase } from '../domain/types';
import { forgeCase } from '../forge/forge';
import { STARTER_CODES } from '../forge/starters';
import { newCaseState, type CaseState } from '../persist/db';

// The first two activity lines of every new case (ARCHITECTURE.md §6).
export const openingActivity = (forged: ForgedCase, flagCount: number, now: string): ActivityEntry[] => [
  { ts: now, who: 'Forge', what: `Case ${forged.displayId} opened by the Forge` },
  { ts: now, who: `Rules v${RULES_V1.version}`, what: `Checks ran: ${flagCount} flags raised` },
];

// The three starter cases of a first run, opened 1 ms apart so the newest (Hard) sorts first (ARCHITECTURE.md §7).
export function starterCases(now: number): CaseState[] {
  return STARTER_CODES.map((code, i) => {
    const forged = forgeCase(code);
    const flagCount = runChecks(forged, disputeStats(forged, RULES_V1), RULES_V1).length;
    const ts = new Date(now + i).toISOString();
    return { ...newCaseState(code, false, ts), activity: openingActivity(forged, flagCount, ts) };
  });
}
