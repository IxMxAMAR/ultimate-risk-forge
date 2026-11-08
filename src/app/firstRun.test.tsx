import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RULES_V1 } from '../domain/ruleset';
import { forgeCase } from '../forge/forge';
import { STARTER_CODES } from '../forge/starters';
import { newCaseState, openStore, type CaseState } from '../persist/db';
import { App } from './App';

const NOW = '2026-11-08T10:00:00.000Z';
const SURPRISE = 'NS-0044-JR';
let n = 0;

beforeEach(() => { window.location.hash = ''; });
afterEach(() => { window.location.hash = ''; });

describe('first run', () => {
  it('seeds the three starters with their opening lines and opens the Hard one', async () => {
    const store = await openStore(`first-${++n}`);
    render(<App store={store} />);
    await waitFor(() => expect(window.location.hash).toBe(`#/case/${STARTER_CODES[2]}`));
    const header = await screen.findByRole('region', { name: 'Case summary' });
    expect(await within(header).findByText(forgeCase(STARTER_CODES[2]).subject.name)).toBeInTheDocument();
    const saved = (await store.all()).sort((a, b) => a.openedAt.localeCompare(b.openedAt));
    expect(saved.map(c => c.code)).toEqual([...STARTER_CODES]);
    for (const c of saved) {
      expect(c.practice).toBe(false);
      expect(c.activity).toHaveLength(2);
      expect(c.activity[0]).toMatchObject({ who: 'Forge', what: `Case ${forgeCase(c.code).displayId} opened by the Forge` });
      expect(c.activity[1]?.who).toBe(`Rules v${RULES_V1.version}`);
      expect(c.activity[1]?.what).toMatch(/^Checks ran: \d+ flags raised$/);
    }
    expect(new Set(saved.map(c => c.openedAt)).size).toBe(3);
  });

  it('does not seed again when the store already has a case', async () => {
    const store = await openStore(`first-${++n}`);
    await store.put(newCaseState(STARTER_CODES[0], false, NOW));
    render(<App store={store} />);
    await screen.findByText(forgeCase(STARTER_CODES[0]).displayId);
    expect(await store.all()).toHaveLength(1);
  });

  it('keeps a hash that names a seeded case', async () => {
    window.location.hash = `#/case/${STARTER_CODES[0]}`;
    render(<App store={await openStore(`first-${++n}`)} />);
    const header = await screen.findByRole('region', { name: 'Case summary' });
    expect(await within(header).findByText(forgeCase(STARTER_CODES[0]).subject.name)).toBeInTheDocument();
    expect(window.location.hash).toBe(`#/case/${STARTER_CODES[0]}`);
  });
});

describe('surprise cases', () => {
  const decide = (c: CaseState, decidedAt: string | null): CaseState => ({
    ...c, decidedAt,
    decision: { action: 'partial-release', keep: 4550000, release: 2050000, reviewDate: '2026-12-15' },
  });

  async function open(path: string, decidedAt: string | null) {
    const store = await openStore(`surprise-${++n}`);
    await store.put(decide(newCaseState(SURPRISE, false, NOW), decidedAt));
    window.location.hash = `#/case/${SURPRISE}${path}`;
    render(<App store={store} />);
  }

  it('hides the type in the list and the report until decided', async () => {
    await open('/report', null);
    const paper = await screen.findByRole('article', { name: 'Risk assessment report' });
    const f = forgeCase(SURPRISE);
    expect(within(paper).getByText(`Unknown case — ${f.subject.name}`)).toBeInTheDocument();
    expect(screen.queryByText('Same facts, same answer')).not.toBeInTheDocument();
    expect(screen.getByText('Revealed after you decide')).toBeInTheDocument();
  });

  it('shows the list title as Unknown case before the decision', async () => {
    await open('', null);
    expect((await screen.findAllByText('Unknown case')).length).toBeGreaterThan(0);
  });

  it('shows the real title and the panel after the decision', async () => {
    await open('/report', NOW);
    const paper = await screen.findByRole('article', { name: 'Risk assessment report' });
    expect(within(paper).getByText(`${forgeCase(SURPRISE).subject.name} — early hold release`)).toBeInTheDocument();
    expect(screen.getByText('Same facts, same answer')).toBeInTheDocument();
    expect(screen.queryByText('Revealed after you decide')).not.toBeInTheDocument();
  });
});
