import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { deriveCase } from '../../app/derive';
import { RULES_V1 } from '../../domain/ruleset';
import { STARTER_CODES } from '../../forge/starters';
import { newCaseState, openStore, type CaseState } from '../../persist/db';
import { buildReport } from '../../report/buildReport';
import { exportCaseJson } from './exportJson';

const CODE = STARTER_CODES[2];
const NOW = '2026-11-08T10:00:00.000Z';
const KEEP = 4550000;

const decided = (c: CaseState): CaseState => ({
  ...c,
  flagStates: {
    'rate-hidden-by-growth': { state: 'confirmed', note: '' }, 'mc-over-limit': { state: 'confirmed', note: '' },
    'visa-over-limit': { state: 'confirmed', note: '' }, 'refunds-low-disputes-high': { state: 'confirmed', note: '' },
    'young-account-fast-growth': { state: 'dismissed', note: 'Matches a documented ad campaign.' },
  },
  decision: { action: 'partial-release', keep: KEEP, release: 6600000 - KEEP, reviewDate: '2026-12-15' },
  overrideReason: 'The kept amount already covers the worst case.',
});

let n = 0;
async function open(mutate: (c: CaseState) => CaseState = decided) {
  const store = await openStore(`report-${++n}`);
  await store.put(mutate(newCaseState(CODE, false, NOW)));
  window.location.hash = `#/case/${CODE}/report`;
  render(<App store={store} />);
  await screen.findAllByRole('button', { name: 'Back to case' });
}

beforeEach(() => { window.location.hash = ''; });
afterEach(() => { window.location.hash = ''; });

describe('report page', () => {
  it('shows the recommendation, override sentence and cover line', async () => {
    await open();
    const paper = screen.getByRole('article', { name: 'Risk assessment report' });
    expect(within(paper).getByRole('heading', { name: 'Partial release' })).toBeInTheDocument();
    expect(within(paper).getAllByText('$45,500').length).toBeGreaterThan(0);
    expect(within(paper).getAllByText('$20,500').length).toBeGreaterThan(0);
    expect(within(paper).getByText('Dec 15, 2026')).toBeInTheDocument();
    expect(within(paper).getByText('The rules suggested “Deny, keep all $66,000.”')).toBeInTheDocument();
    expect(within(paper).getByText(/covers the worst case with a 7% buffer/)).toBeInTheDocument();
    expect(within(paper).getByText('4 confirmed · 1 dismissed')).toBeInTheDocument();
  });

  it('keeps Mark case decided disabled until the message is read and the reviewer is named', async () => {
    const user = userEvent.setup();
    await open();
    const mark = screen.getByRole('button', { name: 'Mark case decided' });
    expect(mark).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /Seller message read/ }));
    expect(mark).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Reviewer name' }), 'Dana');
    expect(mark).toBeEnabled();
    await user.click(mark);
    expect(mark).toBeDisabled();
    expect(screen.getByText('Analyst · Signed')).toBeInTheDocument();
  });

  it('needs a reason when the decision differs from the suggestion', async () => {
    const user = userEvent.setup();
    await open(c => ({ ...decided(c), overrideReason: '' }));
    await user.click(screen.getByRole('checkbox', { name: /Seller message read/ }));
    await user.type(screen.getByRole('textbox', { name: 'Reviewer name' }), 'Dana');
    expect(screen.getByRole('button', { name: 'Mark case decided' })).toBeDisabled();
  });

  it('saves edits to the seller message', async () => {
    const user = userEvent.setup();
    await open();
    const box = screen.getByRole('textbox', { name: 'Message to the seller' });
    await user.clear(box);
    await user.type(box, 'Short note');
    expect(box).toHaveValue('Short note');
    expect(screen.getByText(/2 words/)).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'Risk assessment report' })).getByText('Short note')).toBeInTheDocument();
  });

  it('shows the score and what was missed after a practice case is decided', async () => {
    const user = userEvent.setup();
    await open(c => ({
      ...decided(c), practice: true,
      flagStates: {
        'rate-hidden-by-growth': { state: 'dismissed', note: '' }, 'mc-over-limit': { state: 'confirmed', note: '' },
        'visa-over-limit': { state: 'confirmed', note: '' }, 'refunds-low-disputes-high': { state: 'confirmed', note: '' },
        'young-account-fast-growth': { state: 'dismissed', note: '' },
      },
    }));
    expect(screen.queryByText(/rules would have suggested/)).not.toBeInTheDocument();
    expect(screen.queryByText(/The rules suggested/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Seller message read/ }));
    await user.type(screen.getByRole('textbox', { name: 'Reviewer name' }), 'Dana');
    await user.click(screen.getByRole('button', { name: 'Mark case decided' }));
    const result = await screen.findByRole('region', { name: 'Practice result' });
    expect(within(result).getByText(/\/100$/)).toBeInTheDocument();
    expect(within(result).getByText('What you missed')).toBeInTheDocument();
    expect(within(result).getByText('Dispute rate hidden by growth')).toBeInTheDocument();
    expect(within(result).getByText('The rules would have suggested: Partial release, keep $45,000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark case decided' })).toBeDisabled();
  });

  it('shows no recommendation for an undecided practice case', async () => {
    await open(c => ({ ...c, practice: true }));
    expect(screen.getByText('Choose a decision in the console first')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Back to case' })).toHaveLength(2);
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByText(/suggest/i)).not.toBeInTheDocument();
  });
});

describe('exportCaseJson', () => {
  it('contains the case code, display id and rules version', () => {
    const cs = decided(newCaseState(CODE, false, NOW));
    const v = deriveCase(cs, RULES_V1);
    const json = JSON.parse(exportCaseJson(v, cs, buildReport(v, cs, 'Dana', RULES_V1))) as Record<string, unknown>;
    expect(json.code).toBe(CODE);
    expect(json.displayId).toBe(v.forged.displayId);
    expect(json.rulesVersion).toBe(RULES_V1.version);
    expect(json.decision).toMatchObject({ action: 'partial-release', keep: KEEP });
  });
});
