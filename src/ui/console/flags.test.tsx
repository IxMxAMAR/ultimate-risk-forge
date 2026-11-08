import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { deriveCase } from '../../app/derive';
import { RULES_V1 } from '../../domain/ruleset';
import type { Flag } from '../../domain/types';
import { STARTER_CODES } from '../../forge/starters';
import { newCaseState, openStore, type CaseState, type Store } from '../../persist/db';

const CODE = STARTER_CODES[1];
const viewOf = () => deriveCase(newCaseState(CODE, false, '2026-11-08T10:00:00.000Z'), RULES_V1);

let n = 0;
async function storeWith(mutate: (c: CaseState) => CaseState = c => c): Promise<Store> {
  const store = await openStore(`flags-${++n}`);
  await store.put(mutate(newCaseState(CODE, false, '2026-11-08T10:00:00.000Z')));
  return store;
}

async function open(mutate?: (c: CaseState) => CaseState) {
  window.location.hash = `#/case/${CODE}`;
  render(<App store={await storeWith(mutate)} />);
  await screen.findByRole('region', { name: 'Activity log' });
}

const evidenceFlag = (ids: string[]): Flag => ({ id: 'analyst-1', kind: 'analyst', severity: 'high', title: 'Watch the account age', why: 'Because.', evidence: { tab: 'disputes', ids }, state: 'raised', note: '', addedBy: 'analyst' });

beforeEach(() => { window.location.hash = ''; });
afterEach(() => { window.location.hash = ''; });

describe('flags panel', () => {
  it('J then C confirms the first flag and logs it; C typed in the note does not confirm', async () => {
    const user = userEvent.setup();
    await open();
    const first = viewOf().flags[0]!;
    const log = screen.getByRole('region', { name: 'Activity log' });
    expect(within(log).getByText('No activity yet')).toBeInTheDocument();
    await user.keyboard('j');
    await user.keyboard('c');
    expect(await within(log).findByText(new RegExp(`confirmed “${first.title}”`))).toBeInTheDocument();
    expect(within(log).getByText('now')).toBeInTheDocument();
    expect(screen.getByText('1 confirmed')).toBeInTheDocument();

    await user.keyboard('j');
    const second = viewOf().flags[1]!;
    await user.type(screen.getByRole('textbox', { name: 'Your note' }), 'cc');
    expect(screen.getByRole('textbox', { name: 'Your note' })).toHaveValue('cc');
    expect(within(log).queryByText(new RegExp(`confirmed “${second.title}”`))).not.toBeInTheDocument();
    expect(screen.getByText('1 confirmed')).toBeInTheDocument();
  });

  it('dismisses and undoes with the card buttons and counts them', async () => {
    const user = userEvent.setup();
    await open();
    const total = viewOf().flags.length;
    await user.keyboard('j');
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.getByText('1 dismissed')).toBeInTheDocument();
    expect(screen.getByText(`${total - 1} to review`)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('0 dismissed')).toBeInTheDocument();
    expect(screen.getByText(`${total} to review`)).toBeInTheDocument();
  });

  it('adds an analyst flag from the inline form', async () => {
    const user = userEvent.setup();
    await open(c => ({ ...c, analystFlags: [evidenceFlag(['kpi:refund-rate'])] }));
    await user.click(screen.getByText('Watch the account age'));
    await user.click(screen.getByRole('button', { name: 'Add my own flag' }));
    const add = screen.getByRole('button', { name: 'Add flag' });
    expect(add).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Flag title' }), 'Odd payout pattern');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Flag severity' }), 'critical');
    await user.click(add);
    expect(screen.getByText('Odd payout pattern')).toBeInTheDocument();
    expect(screen.getByText(/added a flag: “Odd payout pattern”/)).toBeInTheDocument();
  });

  it('Evidence scrolls the first matching element into view', async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const user = userEvent.setup();
    await open(c => ({ ...c, analystFlags: [evidenceFlag(['missing', 'kpi:refund-rate'])] }));
    await user.click(screen.getByText('Watch the account age'));
    await user.keyboard('e');
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(document.querySelector('[data-evidence-id="kpi:refund-rate"]'));
  });

  it('lights the header account age and growth stats for the young-account evidence', async () => {
    const user = userEvent.setup();
    await open(c => ({ ...c, analystFlags: [evidenceFlag(['kpi:account-age'])] }));
    const header = screen.getByRole('region', { name: 'Case summary' });
    expect(header.querySelectorAll('.is-evidence')).toHaveLength(0);
    await user.click(screen.getByText('Watch the account age'));
    const lit = [...header.querySelectorAll('.is-evidence')].map(e => e.querySelector('.k')?.textContent);
    expect(lit).toEqual(['Account age', 'Growth vs prior month']);
  });

  it('Ctrl+K focuses the search box', async () => {
    await open();
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('searchbox', { name: 'Search cases' })).toHaveFocus();
  });
});

describe('decision panel', () => {
  it('requires a reason when the chosen action differs from the suggestion', async () => {
    const user = userEvent.setup();
    await open();
    const build = screen.getByRole('button', { name: 'Build report' });
    expect(build).toBeEnabled();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Decision' }), 'partial-release');
    expect(build).toBeDisabled();
    expect(screen.getByText('Add a reason for changing the suggestion')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Reason for changing the suggestion' }), 'Seller agreed to a smaller release');
    expect(build).toBeEnabled();
    expect(screen.queryByText('Add a reason for changing the suggestion')).not.toBeInTheDocument();
    await user.click(build);
    expect(window.location.hash).toBe(`#/case/${CODE}/report`);
  });

  it('clamps a negative hold to $0 and previews the seller message', async () => {
    const user = userEvent.setup();
    await open();
    const hold = screen.getByRole('textbox', { name: 'Hold amount in dollars' });
    await user.clear(hold);
    await user.type(hold, '-100');
    expect(hold).toHaveValue('0');
    expect(hold.closest('.v')).toHaveTextContent('Keep $');
    await user.click(screen.getByRole('button', { name: 'Preview message to seller' }));
    expect(screen.getByRole('region', { name: 'Message to seller' })).not.toBeEmptyDOMElement();
  });

  it('keeps the suggestion out of the DOM in practice mode until the case is decided', async () => {
    const user = userEvent.setup();
    const sug = viewOf().suggestion;
    await open(c => ({ ...c, practice: true }));
    expect(screen.getByText('Hidden in practice mode — make your own call')).toBeInTheDocument();
    expect(screen.queryByText(sug.basis)).not.toBeInTheDocument();
    expect(screen.queryByText(sug.summary)).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Decision' })).toHaveDisplayValue('Choose a decision');
    expect(screen.queryByRole('option', { name: 'Use the suggestion' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Build report' })).toBeDisabled();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Decision' }), 'deny');
    expect(screen.getByRole('button', { name: 'Build report' })).toBeEnabled();
    expect(screen.queryByText(sug.basis)).not.toBeInTheDocument();
  });

  it('shows the suggestion once a practice case is decided', async () => {
    await open(c => ({ ...c, practice: true, decidedAt: '2026-11-08T11:00:00.000Z' }));
    await waitFor(() => expect(screen.getByText(viewOf().suggestion.basis)).toBeInTheDocument());
  });
});
