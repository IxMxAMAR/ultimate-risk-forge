import { describe, expect, it } from 'vitest';
import { forgeCase } from '../forge/forge';
import { STARTER_CODES } from '../forge/starters';
import { openingActivity } from './opening';

describe('openingActivity', () => {
  it('logs the Forge opening and the rules check count at the given time', () => {
    const forged = forgeCase(STARTER_CODES[1]);
    const now = '2026-11-08T10:00:00.000Z';
    expect(openingActivity(forged, 4, now)).toEqual([
      { ts: now, who: 'Forge', what: `Case ${forged.displayId} opened by the Forge` },
      { ts: now, who: 'Rules v1.0', what: 'Checks ran: 4 flags raised' },
    ]);
  });
});
