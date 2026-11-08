import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { deriveCase } from '../../app/derive';
import { RULES_V1 } from '../../domain/ruleset';
import { actionLabel } from '../../domain/labels';
import { STARTER_CODES } from '../../forge/starters';
import { newCaseState, openStore, type CaseState } from '../../persist/db';
import { answerStep, expectedPath } from '../../playbooks/engine';

const CODE = STARTER_CODES[1];
const NOW = '2026-11-08T10:00:00.000Z';
const viewOf = (mutate: (c: CaseState) => CaseState = c => c) => deriveCase(mutate(newCaseState(CODE, false, NOW)), RULES_V1);

let n = 0;
async function open(mutate: (c: CaseState) => CaseState = c => c) {
  const store = await openStore(`playbook-flow-${++n}`);
  await store.put(mutate(newCaseState(CODE, false, NOW)));
  window.location.hash = `#/case/${CODE}`;
  render(<App store={store} />);
  await screen.findByRole('region', { name: 'Playbook' });
  await waitFor(() => expect(document.querySelector('.flags .flag.sel')).not.toBeNull());
}
const log = () => screen.getByRole('region', { name: 'Activity log' });
const bar = () => screen.getByRole('region', { name: 'Playbook' });
const practice = (c: CaseState): CaseState => ({ ...c, practice: true });

beforeEach(() => { window.location.hash = ''; });
afterEach(() => { window.location.hash = ''; });

describe('playbook in the console', () => {
  it('key 1 answers the sales jump, confirms nothing and advances', async () => {
    const user = userEvent.setup();
    await open();
    expect(within(bar()).getByText('Step 1 of 6')).toBeInTheDocument();
    await user.keyboard('1');
    expect(await within(bar()).findByText('Step 2 of 6')).toBeInTheDocument();
    expect(screen.getByText('0 confirmed')).toBeInTheDocument();
    expect(within(log()).getByText(/answered “Did sales jump recently\?”: Yes/)).toBeInTheDocument();
  });

  it('answering Hidden rate yes confirms the flag and logs one line; the same answer again logs nothing', async () => {
    const user = userEvent.setup();
    await open();
    await user.keyboard('11');
    expect(await screen.findByText('1 confirmed')).toBeInTheDocument();
    expect(within(log()).getAllByText(/answered/)).toHaveLength(2);
    await user.click(within(bar()).getByRole('button', { name: 'Hidden rate' }));
    await user.keyboard('1');
    expect(within(log()).getAllByText(/answered/)).toHaveLength(2);
    expect(screen.getByText('1 confirmed')).toBeInTheDocument();
    expect(within(bar()).getByText('Step 3 of 6')).toBeInTheDocument();
  });

  it('typing 1 in the hold field records nothing', async () => {
    const user = userEvent.setup();
    await open();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Decision' }), 'partial-release');
    await user.click(screen.getByRole('textbox', { name: 'Hold amount in dollars' }));
    await user.keyboard('1');
    expect(within(bar()).getByText('Step 1 of 6')).toBeInTheDocument();
    expect(within(log()).queryByText(/answered/)).toBeNull();
  });

  it('reopening the first step and answering No clears the later answers and returns their flags to raised', async () => {
    const user = userEvent.setup();
    await open();
    await user.keyboard('11');
    expect(await screen.findByText('1 confirmed')).toBeInTheDocument();
    await user.click(within(bar()).getByRole('button', { name: 'Sales jump' }));
    expect(within(bar()).getByText('Did sales jump recently?')).toBeInTheDocument();
    await user.keyboard('2');
    await waitFor(() => expect(screen.getByText('0 confirmed')).toBeInTheDocument());
    expect(screen.getByText('0 dismissed')).toBeInTheDocument();
    expect(within(bar()).getAllByTitle('skipped — not needed')).toHaveLength(2);
    expect(within(bar()).getByText('Card brands', { selector: 'li' })).toHaveAttribute('aria-current', 'step');
  });

  it('multi-select: keys toggle options and Enter sends them', async () => {
    const user = userEvent.setup();
    await open();
    await user.keyboard('11');
    expect(await within(bar()).findByText('Is any card brand over its network line?')).toBeInTheDocument();
    await user.keyboard('13');
    expect(within(bar()).getByRole('button', { name: /Mastercard 3%\+/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(bar()).getByRole('button', { name: /Visa 1\.5%\+/ })).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('3');
    expect(within(bar()).getByRole('button', { name: /Visa 1\.5%\+/ })).toHaveAttribute('aria-pressed', 'false');
    await user.keyboard('{Enter}');
    expect(await within(log()).findByText(/answered “Is any card brand over its network line\?”: Mastercard 3%\+$/)).toBeInTheDocument();
  });

  it('dismissing the hidden flag in the Flags column shows the drift note', async () => {
    const user = userEvent.setup();
    await open();
    await user.keyboard('11');
    await screen.findByText('1 confirmed');
    const hidden = viewOf().flags.find(f => f.id === 'rate-hidden-by-growth')!;
    await user.click(screen.getByRole('button', { name: hidden.title }));
    await user.keyboard('d');
    expect(await within(bar()).findByText(/changed outside the playbook/)).toBeInTheDocument();
  });

  it('a look-at chip outlines its evidence and a chosen flag takes the outline back', async () => {
    const user = userEvent.setup();
    await open();
    await user.keyboard('1');
    await user.click(within(bar()).getByRole('button', { name: /^30-day/ }));
    expect([...document.querySelectorAll('.is-evidence')].map(e => e.getAttribute('data-evidence-id'))).toEqual(['kpi:rate-30d']);
    await user.click(screen.getByRole('button', { name: viewOf().flags[1]!.title }));
    expect(document.querySelector('[data-evidence-id="kpi:rate-30d"]')).not.toHaveClass('is-evidence');
  });

  it('Accept all answers every step, and the suggestion equals the ending', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(within(bar()).getByRole('button', { name: "Accept the data's answers" }));
    const fresh = viewOf();
    const expected = expectedPath(fresh.playbook!, fresh);
    let answers = {};
    const flagStates: CaseState['flagStates'] = {};
    for (const [id, chosen] of Object.entries(expected)) {
      const next = answerStep(fresh.playbook!, fresh, answers, id, chosen);
      answers = next.answers;
      for (const [flag, state] of Object.entries(next.flagStates)) flagStates[flag] = { state, note: '' };
    }
    expect(await within(log()).findByText(`Analyst accepted the data's answers (${Object.keys(expected).length} steps)`)).toBeInTheDocument();
    const ending = viewOf(c => ({ ...c, flagStates, playbook: { answers, collapsed: false } })).suggestion;
    expect(within(bar()).getByText(ending.summary)).toBeInTheDocument();
    const sugg = document.querySelector('.decision .sugg')!;
    expect(sugg).toHaveTextContent(actionLabel(ending.action, viewOf().forged.trigger.kind));
    expect(sugg).toHaveTextContent(ending.basis);
  });

  it('shows nothing of the data, conclusion or expected path in practice before deciding', async () => {
    const user = userEvent.setup();
    await open(practice);
    await user.keyboard('11');
    await user.keyboard('1');
    await user.keyboard('{Enter}');
    await user.keyboard('222');
    await within(bar()).findByText(/All steps answered/);
    const html = document.body.innerHTML;
    const suggestion = viewOf().suggestion;
    expect(html).not.toMatch(/Data says|Accept|Use this decision/);
    expect(html).not.toContain(suggestion.summary);
    expect(html).not.toContain(suggestion.basis);
    expect(html).not.toContain('Expected:');
    expect(html).toContain('Hidden in practice mode');
  });

  it('shows the comparison in practice once decided, and decided cases ignore keys 1-4', async () => {
    const user = userEvent.setup();
    await open(c => ({ ...practice(c), decidedAt: NOW }));
    expect(within(bar()).getByRole('button', { name: "Accept the data's answers" })).toBeDisabled();
    await user.keyboard('1');
    expect(within(bar()).getByText('Step 1 of 6')).toBeInTheDocument();
    expect(within(log()).queryByText(/answered/)).toBeNull();
    expect(within(bar()).getAllByText('Data says').length).toBeGreaterThan(0);
  });
});
