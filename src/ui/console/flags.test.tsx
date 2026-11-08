import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { deriveCase } from '../../app/derive';
import { RULES_V1 } from '../../domain/ruleset';
import type { Flag } from '../../domain/types';
import { STARTER_CODES } from '../../forge/starters';
import { startingKeep } from './DecisionPanel';
import { newCaseState, openStore, type CaseState, type Store } from '../../persist/db';

const CODE = STARTER_CODES[1];
const viewOf = (mutate: (c: CaseState) => CaseState = c => c) => deriveCase(mutate(newCaseState(CODE, false, '2026-11-08T10:00:00.000Z')), RULES_V1);
// Every critical and high flag dismissed, so the rules suggest releasing the hold.
const cleared = (c: CaseState): CaseState => ({
  ...c, flagStates: Object.fromEntries(viewOf().ruleFlags.filter(f => f.severity === 'critical' || f.severity === 'high').map(f => [f.id, { state: 'dismissed' as const, note: '' }])),
});

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
afterEach(() => {
  window.location.hash = '';
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

describe('flags panel', () => {
  it('opens with the first raised flag selected and every card showing why it matters', async () => {
    await open();
    await waitFor(() => expect(document.querySelector('.flags .flag.sel')).not.toBeNull());
    const flags = viewOf().flags;
    const cards = document.querySelectorAll('.flags .flag');
    expect(cards[0]).toHaveAttribute('aria-current', 'true');
    expect(cards[1]).not.toHaveAttribute('aria-current');
    for (const [i, f] of flags.entries()) expect(within(cards[i] as HTMLElement).getByText(f.why)).toBeInTheDocument();
  });

  it('J then C confirms the first flag and logs it; C typed in the note does not confirm', async () => {
    const user = userEvent.setup();
    await open();
    const first = viewOf().flags[0]!;
    const log = screen.getByRole('region', { name: 'Activity log' });
    expect(within(log).getByText('No activity yet')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.flags .flag.sel')).not.toBeNull());
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
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: scroll, configurable: true, writable: true });
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

  it('Ctrl+K focuses the search box, also from inside another field', async () => {
    await open();
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Decision' }), 'partial-release');
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
    const search = screen.getByRole('searchbox', { name: 'Search cases' });
    expect(search).toHaveFocus();
    screen.getByRole('textbox', { name: 'Hold amount in dollars' }).focus();
    fireEvent.keyDown(document.activeElement!, { key: 'k', ctrlKey: true });
    expect(search).toHaveFocus();
  });

  it('selects a card from its title button with Enter and Space', async () => {
    const user = userEvent.setup();
    await open();
    const flags = viewOf().flags;
    const second = screen.getByRole('button', { name: flags[1]!.title });
    expect(second).toHaveAttribute('aria-pressed', 'false');
    second.focus();
    await user.keyboard('{Enter}');
    expect(second).toHaveAttribute('aria-pressed', 'true');
    const third = screen.getByRole('button', { name: flags[2]!.title });
    third.focus();
    await user.keyboard(' ');
    expect(third).toHaveAttribute('aria-pressed', 'true');
    expect(second).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('decision panel', () => {
  it('asks for the flags to be reviewed instead of suggesting a release while critical or high flags are open', async () => {
    const user = userEvent.setup();
    await open();
    const sugg = document.querySelector('.sugg');
    expect(sugg).toHaveTextContent('Review the flags first');
    expect(sugg).toHaveTextContent('3 critical or high flags still open');
    expect(sugg).not.toHaveTextContent('Release the hold');
    expect(document.querySelector('.field .v')).toHaveTextContent('—');
    expect(screen.getByRole('combobox', { name: 'Decision' })).toHaveDisplayValue('Choose a decision');
    expect(screen.queryByRole('option', { name: 'Use the suggestion' })).not.toBeInTheDocument();
    const build = screen.getByRole('button', { name: 'Build report' });
    expect(build).toBeDisabled();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Decision' }), 'deny');
    expect(build).toBeEnabled();
    expect(screen.queryByText('Add a reason for changing the suggestion')).not.toBeInTheDocument();
  });

  it('says one flag in the singular', async () => {
    await open(c => ({ ...cleared(c), flagStates: { ...cleared(c).flagStates, 'visa-over-limit': { state: 'raised', note: '' } } }));
    expect(document.querySelector('.sugg')).toHaveTextContent('1 critical or high flag still open');
  });

  it('suggests the release once every critical and high flag is reviewed', async () => {
    await open(cleared);
    expect(document.querySelector('.sugg')).toHaveTextContent('Release the hold');
    expect(screen.getByRole('combobox', { name: 'Decision' })).toHaveValue('suggestion');
  });

  it('colours the suggestion by action and shows the hold on one line with thousands separators', async () => {
    await open(cleared);
    const sugg = viewOf(cleared).suggestion;
    const tone = { deny: 'crit', block: 'crit', escalate: 'crit', approve: 'ok' }[sugg.action as string] ?? 'high';
    expect(document.querySelector('.sugg')).toHaveClass(tone);
    expect(screen.queryByRole('textbox', { name: 'Hold amount in dollars' })).not.toBeInTheDocument();
    expect(document.querySelector('.field .v')).toHaveTextContent(`Keep$${(sugg.keep / 100).toLocaleString('en-US')}`);
  });

  it('requires a reason when the chosen action differs from the suggestion', async () => {
    const user = userEvent.setup();
    await open(cleared);
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

  it('logs one line for a typed hold, none for a reason edit, and no reason text without a reason', async () => {
    const user = userEvent.setup();
    await open(cleared);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Decision' }), 'partial-release');
    const log = screen.getByRole('region', { name: 'Activity log' });
    const lines = () => log.querySelectorAll('.act span').length;
    const before = lines();
    const hold = screen.getByRole('textbox', { name: 'Hold amount in dollars' });
    await user.clear(hold);
    await user.type(hold, '1500');
    expect(lines()).toBe(before);
    await user.tab();
    expect(lines()).toBe(before + 1);
    expect(within(log).getAllByText(/changed the decision to .*\.$/).at(-1)).not.toHaveTextContent('Reason recorded.');
    const reason = screen.getByRole('textbox', { name: 'Reason for changing the suggestion' });
    await user.type(reason, 'Seller sent proof');
    await user.tab();
    expect(lines()).toBe(before + 1);
  });

  it('reverts an empty hold on blur and commits on Enter', async () => {
    const user = userEvent.setup();
    await open();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Decision' }), 'partial-release');
    const log = screen.getByRole('region', { name: 'Activity log' });
    const before = log.querySelectorAll('.act span').length;
    const hold = screen.getByRole('textbox', { name: 'Hold amount in dollars' });
    const was = (hold as HTMLInputElement).value;
    await user.clear(hold);
    await user.tab();
    expect(hold).toHaveValue(was);
    expect(screen.getByText('Enter an amount in dollars')).toBeInTheDocument();
    await user.type(hold, '250{Enter}');
    expect(log.querySelectorAll('.act span')).toHaveLength(before + 1);
    expect(screen.queryByText('Enter an amount in dollars')).not.toBeInTheDocument();
  });

  it('clamps a negative hold to $0 and previews the seller message', async () => {
    const user = userEvent.setup();
    await open();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Decision' }), 'partial-release');
    const hold = screen.getByRole('textbox', { name: 'Hold amount in dollars' });
    await user.clear(hold);
    await user.type(hold, '-100');
    await user.tab();
    expect(hold).toHaveValue('0');
    expect(hold.closest('.v')).toHaveTextContent(/Keep\s*\$/);
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

  it('starts a hidden partial release from half the hold, not from the suggestion', async () => {
    const user = userEvent.setup();
    await open(c => ({ ...c, practice: true }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Decision' }), 'partial-release');
    const held = viewOf().forged.trigger.heldAmount;
    expect(screen.getByRole('textbox', { name: 'Hold amount in dollars' })).toHaveValue((Math.round(held / 2 / 100000) * 1000).toLocaleString('en-US'));
  });

  it('starts a hidden smaller hold from half the hold too', async () => {
    const user = userEvent.setup();
    await open(c => ({ ...c, practice: true }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Decision' }), 'approve-smaller-hold');
    const held = viewOf().forged.trigger.heldAmount;
    expect(screen.getByRole('textbox', { name: 'Hold amount in dollars' })).toHaveValue((Math.round(held / 2 / 100000) * 1000).toLocaleString('en-US'));
  });

  it('shows the suggestion once a practice case is decided', async () => {
    await open(c => ({ ...cleared(c), practice: true, decidedAt: '2026-11-08T11:00:00.000Z' }));
    await waitFor(() => expect(screen.getByText(viewOf(cleared).suggestion.basis)).toBeInTheDocument());
  });
});

describe('startingKeep', () => {
  it('stays strictly between 0 and the held amount', () => {
    expect(startingKeep(100_000, 0)).toBe(50_000);
    expect(startingKeep(150_000, 0)).toBe(100_000);
    expect(startingKeep(4_200_000, 0)).toBe(2_100_000);
    expect(startingKeep(4_200_000, 300_000)).toBe(300_000);
    expect(startingKeep(4_200_000, 4_200_000)).toBe(2_100_000);
  });
});

describe('decision panel hold entry', () => {
  const typeHold = async (text: string) => {
    const user = userEvent.setup();
    await open();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Decision' }), 'partial-release');
    const hold = screen.getByRole('textbox', { name: 'Hold amount in dollars' });
    await user.clear(hold);
    await user.type(hold, `${text}{Enter}`);
    return hold;
  };

  it.each([['28,000', '28,000'], ['$28,000', '28,000'], [' $ 28 000 ', '28,000']])('reads %s as dollars', async (text, shown) => {
    const hold = await typeHold(text);
    expect(hold).toHaveValue(shown);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says so when the text is not an amount', async () => {
    const hold = await typeHold('abc');
    expect(screen.getByRole('status')).toHaveTextContent('Enter an amount in dollars');
    expect(hold).not.toHaveValue('abc');
  });

  it('says when a value was kept within the hold', async () => {
    const held = viewOf().forged.trigger.heldAmount;
    expect(await typeHold('-5')).toHaveValue('0');
    expect(screen.getByRole('status')).toHaveTextContent(`Kept within $0–$${(held / 100).toLocaleString('en-US')}`);
  });

  it('clamps a huge value to the hold and clears the note on the next good entry', async () => {
    const user = userEvent.setup();
    const held = viewOf().forged.trigger.heldAmount;
    const hold = await typeHold('999999999');
    expect(hold).toHaveValue((held / 100).toLocaleString('en-US'));
    expect(screen.getByRole('status')).toHaveTextContent('Kept within');
    await user.clear(hold);
    await user.type(hold, '1000{Enter}');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the hold as text, not a field, for held-in-full actions and approve', async () => {
    const user = userEvent.setup();
    await open();
    for (const action of ['approve', 'deny', 'hold-payouts', 'escalate', 'block', 'refund-buyers']) {
      await user.selectOptions(screen.getByRole('combobox', { name: 'Decision' }), action);
      expect(screen.queryByRole('textbox', { name: 'Hold amount in dollars' })).not.toBeInTheDocument();
    }
    for (const action of ['partial-release', 'approve-smaller-hold']) {
      await user.selectOptions(screen.getByRole('combobox', { name: 'Decision' }), action);
      expect(screen.getByRole('textbox', { name: 'Hold amount in dollars' })).toBeInTheDocument();
    }
  });
});

describe('a decided case', () => {
  const done = (c: CaseState): CaseState => ({
    ...c, decidedAt: '2026-11-08T11:00:00.000Z',
    decision: { action: 'partial-release', keep: 3000000, release: 3600000, reviewDate: '2026-12-15' },
  });

  it('locks the flag, note and decision controls and asks for no reason', async () => {
    await open(c => ({ ...done(c), practice: true }));
    await waitFor(() => expect(document.querySelector('.flags .flag.sel')).not.toBeNull());
    expect(screen.getByRole('button', { name: /Confirm/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Dismiss/ })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Your note' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Add my own flag/ })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Decision' })).toBeDisabled();
    expect(screen.queryByRole('textbox', { name: 'Hold amount in dollars' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Build report' })).toBeEnabled();
  });

  it('ignores the C and D shortcuts', async () => {
    const user = userEvent.setup();
    await open(done);
    await waitFor(() => expect(document.querySelector('.flags .flag.sel')).not.toBeNull());
    await user.keyboard('c');
    await user.keyboard('d');
    expect(screen.getByRole('region', { name: 'Activity log' })).toHaveTextContent('No activity yet');
  });

  it('disables Undo on a reviewed flag', async () => {
    const id = viewOf().ruleFlags[0]!.id;
    await open(c => ({ ...done(c), flagStates: { [id]: { state: 'confirmed', note: '' } } }));
    expect(screen.getAllByRole('button', { name: 'Undo' })[0]).toBeDisabled();
  });
});

describe('an unreadable stored case', () => {
  it('is listed by its code and replaces the console with a message', async () => {
    const store = await storeWith();
    await store.put(newCaseState('TD-009R-HK', false, '2026-11-09T10:00:00.000Z'));
    window.location.hash = '#/case/TD-009R-HK';
    render(<App store={store} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('This case can’t be read');
    const row = screen.getByRole('button', { name: /Unreadable case/ });
    expect(row).toHaveTextContent('TD-009R-HK');
    expect(row.querySelector('.sev')).toBeNull();
    expect(screen.getAllByRole('button', { name: /Only/ }).length).toBeGreaterThan(0);
  });
});
