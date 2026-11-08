import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { deriveCase } from '../../app/derive';
import { RULES_V1 } from '../../domain/ruleset';
import { STARTER_CODES } from '../../forge/starters';
import { newCaseState, openStore, type CaseState } from '../../persist/db';
import { expectedPath } from '../../playbooks/engine';

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

  it('answering the same step again repairs a changed flag without a new answered line', async () => {
    const user = userEvent.setup();
    await open();
    await user.keyboard('11');
    await screen.findByText('1 confirmed');
    const hidden = viewOf().flags.find(f => f.id === 'rate-hidden-by-growth')!;
    await user.click(screen.getByRole('button', { name: hidden.title }));
    await user.keyboard('d');
    expect(await within(bar()).findByText(/changed outside the playbook/)).toBeInTheDocument();
    await user.click(within(bar()).getByRole('button', { name: 'Hidden rate' }));
    await user.keyboard('1');
    expect(await screen.findByText('1 confirmed')).toBeInTheDocument();
    expect(within(bar()).queryByText(/changed outside the playbook/)).toBeNull();
    expect(within(log()).getAllByText(/answered/)).toHaveLength(2);
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

  it('Accept all answers every step, confirms the five flags and the suggestion equals the ending', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(within(bar()).getByRole('button', { name: "Accept the data's answers" }));
    expect(await within(log()).findByText('Analyst answered “Did sales jump recently?”: Yes — 5× last month')).toBeInTheDocument();
    expect(within(log()).getAllByText(/answered/)).toHaveLength(6);
    expect(within(log()).queryByText(/accepted the data/)).toBeNull();
    // PD-009R-HF: the expected path (jump yes, hidden yes, Mastercard 3%+ and Visa, refunds yes, not explained) confirms all five flags.
    expect(screen.getByText('5 confirmed')).toBeInTheDocument();
    expect(screen.getByText('0 dismissed')).toBeInTheDocument();
    const basis = document.querySelector('.decision .sugg small')!.textContent!;
    expect(basis).not.toBe('');
    expect(document.querySelector('.pconc')).toHaveTextContent(basis);
  });

  it('shows nothing of the data, conclusion or expected path in practice before deciding, at every step', async () => {
    const user = userEvent.setup();
    await open(practice);
    const noLeak = () => {
      expect(bar()).toBeInTheDocument();
      expect(within(bar()).queryByRole('button', { name: 'Collapse' })).not.toBeNull();
      const html = document.body.innerHTML;
      expect(html).not.toMatch(/Data says|Accept the data|Use this decision|Expected:/);
      for (const text of ['Release all $64,000', 'Partial release, keep $42,000', 'Deny, keep all $64,000', 'No confirmed critical or high flags', 'Confirmed risk']) expect(html).not.toContain(text);
      for (const el of document.body.querySelectorAll('[aria-label],[title]')) {
        expect(`${el.getAttribute('aria-label')} ${el.getAttribute('title')}`).not.toMatch(/Data says|Accept|Use this decision/);
      }
    };
    noLeak();
    expect(within(bar()).getByText('Did sales jump recently?')).toBeInTheDocument();
    await user.keyboard('1');
    await within(bar()).findByText('Step 2 of 6');
    noLeak();
    await user.keyboard('1');
    await within(bar()).findByText('Step 3 of 6');
    noLeak();
    await user.keyboard('4');
    await user.keyboard('{Enter}');
    await user.keyboard('222');
    await within(bar()).findByText(/All steps answered/);
    noLeak();
    expect(document.body.innerHTML).toContain('Hidden in practice mode');
  });

  it('reads Step 1 of 6 for a reopened first step after three answers', async () => {
    const user = userEvent.setup();
    await open();
    await user.keyboard('11');
    await user.keyboard('4');
    await user.keyboard('{Enter}');
    expect(await within(bar()).findByText('Step 4 of 6')).toBeInTheDocument();
    expect(within(bar()).getByText('~2 min')).toBeInTheDocument();
    await user.click(within(bar()).getByRole('button', { name: 'Sales jump' }));
    expect(within(bar()).getByText('Step 1 of 6')).toBeInTheDocument();
    expect(within(bar()).getByText('~3 min')).toBeInTheDocument();
  });

  it('forgets a reopened step when another case opens', async () => {
    const user = userEvent.setup();
    const other = STARTER_CODES[2];
    const store = await openStore(`playbook-flow-${++n}`);
    await store.put(newCaseState(CODE, false, NOW));
    await store.put({ ...newCaseState(other, false, NOW), playbook: { answers: { jump: ['yes'] }, collapsed: false } });
    window.location.hash = `#/case/${CODE}`;
    render(<App store={store} />);
    await screen.findByRole('region', { name: 'Playbook' });
    await user.keyboard('1');
    await within(bar()).findByText('Step 2 of 6');
    await user.click(within(bar()).getByRole('button', { name: 'Sales jump' }));
    expect(within(bar()).getByText('Step 1 of 6')).toBeInTheDocument();
    await user.click(document.querySelector<HTMLElement>('button.case:not(.active)')!);
    expect(await within(bar()).findByText('Step 2 of 6')).toBeInTheDocument();
  });

  it('drops unsent picks when Accept all answers the step, so a reopened step shows the stored answer', async () => {
    const user = userEvent.setup();
    await open();
    const fresh = viewOf();
    const stored = expectedPath(fresh.playbook!, fresh).brands!;
    const brands = fresh.playbook!.steps.find(s => s.id === 'brands')!.answers(fresh);
    const stray = brands.findIndex((a, i) => i < 4 && !a.exclusive && !stored.includes(a.id));
    expect(stray).toBeGreaterThanOrEqual(0);
    await user.keyboard('11');
    await user.keyboard(String(stray + 1));
    await user.click(within(bar()).getByRole('button', { name: "Accept the data's answers" }));
    await within(bar()).findByRole('button', { name: 'Use this decision' });
    await user.click(within(bar()).getByRole('button', { name: 'Card brands' }));
    for (const a of brands) {
      expect(within(bar()).getByText(a.label, { selector: 'b' }).closest('button')).toHaveAttribute('aria-pressed', String(stored.includes(a.id)));
    }
  });

  it('ignores keys 1-4 and Enter while the bar is collapsed', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(within(bar()).getByRole('button', { name: 'Collapse' }));
    await user.keyboard('1');
    await user.keyboard('{Enter}');
    expect(within(log()).queryByText(/answered/)).toBeNull();
    await user.click(within(bar()).getByRole('button', { name: 'Expand' }));
    expect(within(bar()).getByText('Step 1 of 6')).toBeInTheDocument();
  });

  it('ignores 1 while the Forge modal is open', async () => {
    const user = userEvent.setup();
    await open();
    await user.keyboard('11');
    await within(bar()).findByText('Step 3 of 6');
    await user.keyboard('4');
    await user.click(screen.getByRole('button', { name: /New case/ }));
    await screen.findByRole('dialog');
    await user.keyboard('1');
    await user.keyboard('{Escape}');
    expect(await within(bar()).findByText('Step 3 of 6')).toBeInTheDocument();
    expect(within(bar()).getByRole('button', { name: /Mastercard 3%\+/ })).toHaveAttribute('aria-pressed', 'false');
    expect(within(bar()).getByRole('button', { name: /^None/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(log()).getAllByText(/answered/)).toHaveLength(2);
  });

  it('does not answer the step when Enter is pressed while typing in the hold field', async () => {
    const user = userEvent.setup();
    await open();
    await user.keyboard('11');
    await within(bar()).findByText('Step 3 of 6');
    await user.keyboard('4');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Decision' }), 'partial-release');
    await user.click(screen.getByRole('textbox', { name: 'Hold amount in dollars' }));
    await user.keyboard('{Enter}');
    expect(within(log()).getAllByText(/answered/)).toHaveLength(2);
    expect(within(bar()).getByText('Step 3 of 6')).toBeInTheDocument();
  });

  it('Use this decision saves the suggestion on a normal case', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(within(bar()).getByRole('button', { name: "Accept the data's answers" }));
    await user.click(await within(bar()).findByRole('button', { name: 'Use this decision' }));
    expect(await within(log()).findByText(/changed the decision to/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Decision' })).toHaveValue('suggestion');
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
