import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { AppProvider, useApp } from '../../app/AppContext';
import { parseRoute } from '../../app/routes';
import { RULES_V1 } from '../../domain/ruleset';
import { forgeCase } from '../../forge/forge';
import { STARTER_CODES } from '../../forge/starters';
import { formatMoney } from '../../lib/money';
import { deriveCase } from '../../app/derive';
import { newCaseState, openStore, type CaseState, type Store } from '../../persist/db';
import { Segmented } from '../Segmented';

let n = 0;
async function seededStore(mutate: (c: CaseState) => CaseState = c => c): Promise<Store> {
  const store = await openStore(`shell-${++n}`);
  for (const [i, code] of STARTER_CODES.entries()) await store.put(mutate(newCaseState(code, false, `2026-11-0${i + 1}T10:00:00.000Z`)));
  return store;
}

beforeEach(() => { window.location.hash = ''; });
afterEach(() => { window.location.hash = ''; });

describe('parseRoute', () => {
  it('reads the four routes and ignores junk', () => {
    expect(parseRoute('')).toEqual({ page: 'console', code: null, forge: false });
    expect(parseRoute('#/')).toEqual({ page: 'console', code: null, forge: false });
    expect(parseRoute('#/case/ZM-G0KH-5A')).toEqual({ page: 'console', code: 'ZM-G0KH-5A', forge: false });
    expect(parseRoute('#/case/ZM-G0KH-5A/report')).toEqual({ page: 'report', code: 'ZM-G0KH-5A', forge: false });
    expect(parseRoute('#/forge')).toEqual({ page: 'console', code: null, forge: true });
    expect(parseRoute('#/nonsense/1')).toEqual({ page: 'console', code: null, forge: false });
  });
});

describe('console shell', () => {
  it('lists the cases with display ids and seller names', async () => {
    render(<App store={await seededStore()} />);
    for (const code of STARTER_CODES) {
      const f = forgeCase(code);
      expect(await screen.findByText(f.displayId)).toBeInTheDocument();
      expect(screen.getByText(f.subject.name)).toBeInTheDocument();
    }
    expect(document.querySelectorAll('button.case')).toHaveLength(3);
  });

  it('filters by seller name and by code', async () => {
    const user = userEvent.setup();
    render(<App store={await seededStore()} />);
    const [a, b] = [forgeCase(STARTER_CODES[0]), forgeCase(STARTER_CODES[1])];
    await screen.findByText(a.displayId);
    const search = screen.getByRole('searchbox', { name: 'Search cases' });
    await user.type(search, a.subject.name.toLowerCase());
    expect(screen.getByText(a.displayId)).toBeInTheDocument();
    expect(screen.queryByText(b.displayId)).not.toBeInTheDocument();
    await user.clear(search);
    await user.type(search, b.code.toLowerCase());
    expect(screen.getByText(b.displayId)).toBeInTheDocument();
    expect(screen.queryByText(a.displayId)).not.toBeInTheDocument();
  });

  it('opens a case into the hash and shows its header', async () => {
    const user = userEvent.setup();
    render(<App store={await seededStore()} />);
    const f = forgeCase(STARTER_CODES[1]);
    await user.click(await screen.findByText(f.displayId));
    expect(window.location.hash).toBe(`#/case/${f.code}`);
    const header = await screen.findByRole('region', { name: 'Case summary' });
    expect(within(header).getByText(f.subject.name)).toBeInTheDocument();
    expect(within(header).getByText('Money at stake').nextSibling).toHaveTextContent(formatMoney(f.trigger.heldAmount));
    expect(within(header).getByText('New')).toBeInTheDocument();
  });

  it('shows growth, sales and the data tab for the normal starter', async () => {
    window.location.hash = `#/case/${STARTER_CODES[1]}`;
    render(<App store={await seededStore()} />);
    const header = await screen.findByRole('region', { name: 'Case summary' });
    const v = deriveCase(newCaseState(STARTER_CODES[1], false, ''), RULES_V1);
    expect(within(header).getByText('Growth vs prior month').nextSibling).toHaveTextContent('5.0×');
    expect(within(header).getByText('Sales, last 30 days').nextSibling).toHaveTextContent(formatMoney(v.stats.last30Sales));
    expect(within(header).getByText('Account age').nextSibling).toHaveTextContent(`${v.forged.subject.accountAgeMonths} mo`);
    const tabs = screen.getByText("This case's data").parentElement!;
    const flags = v.flags.filter(f => f.evidence.tab === 'disputes').length;
    expect(within(tabs).getAllByRole('link')).toHaveLength(1);
    expect(within(tabs).getByRole('link')).toHaveTextContent(`Disputes${v.forged.disputes.length} · ${flags} flags`);
  });

  it('ignores a hash with an unknown code', async () => {
    window.location.hash = '#/case/ZZ-ZZZZ-ZZ';
    render(<App store={await seededStore()} />);
    expect(await screen.findByText('Open or forge a case to begin.')).toBeInTheDocument();
  });

  it('reflects the practice flag in the top bar', async () => {
    window.location.hash = `#/case/${STARTER_CODES[0]}`;
    const store = await seededStore(c => ({ ...c, practice: c.code === STARTER_CODES[0] }));
    render(<App store={store} />);
    const status = screen.getByRole('button', { name: /Practice mode/ });
    await waitFor(() => expect(status).toHaveAttribute('aria-pressed', 'true'));
    expect(status).toHaveAttribute('aria-disabled', 'true');
    expect(status).toHaveAttribute('title', 'Set when the case is forged');
  });

  it('counts open and decided cases and filters on them', async () => {
    const user = userEvent.setup();
    const store = await seededStore(c => (c.code === STARTER_CODES[2] ? { ...c, decidedAt: '2026-11-08T10:00:00.000Z' } : c));
    render(<App store={store} />);
    await screen.findByText(forgeCase(STARTER_CODES[0]).displayId);
    expect(screen.getByRole('button', { name: 'Open 2' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Decided 1' }));
    expect(screen.getByText(forgeCase(STARTER_CODES[2]).displayId)).toBeInTheDocument();
    expect(screen.queryByText(forgeCase(STARTER_CODES[0]).displayId)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All 3' })).toBeInTheDocument();
  });

  it('warns when storage is blocked', async () => {
    const store = { ...(await seededStore()), persistent: false };
    render(<App store={store} />);
    expect(await screen.findByText("Storage is blocked — this session won't be saved.")).toBeInTheDocument();
  });

  it('saves a changed case 300 ms after the change', async () => {
    const store = await seededStore();
    window.location.hash = `#/case/${STARTER_CODES[0]}`;
    function Edit() {
      const { dispatch } = useApp();
      return <button onClick={() => dispatch({ type: 'set-seller-message', text: 'hello' })}>edit</button>;
    }
    const user = userEvent.setup();
    render(<AppProvider store={store}><Edit /></AppProvider>);
    await waitFor(() => expect(window.location.hash).toContain(STARTER_CODES[0]));
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    await user.click(screen.getByText('edit'));
    expect((await store.all()).every(c => c.sellerMessage === null)).toBe(true);
    await waitFor(async () => expect((await store.all()).find(c => c.code === STARTER_CODES[0])?.sellerMessage).toBe('hello'), { timeout: 1500 });
  });
});

describe('Segmented', () => {
  it('marks the selected option and reports changes', async () => {
    const user = userEvent.setup();
    let picked = '';
    render(<Segmented label="Rate basis" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} value="a" onChange={v => { picked = v; }} />);
    expect(screen.getByRole('tab', { name: 'A' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'B' }));
    expect(picked).toBe('b');
  });
});
