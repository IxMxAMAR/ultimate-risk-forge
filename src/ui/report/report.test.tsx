import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { deriveCase } from '../../app/derive';
import { encodeCaseCode } from '../../domain/caseCode';
import { RULES_V1 } from '../../domain/ruleset';
import { expectedPath } from '../../playbooks/engine';
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
async function open(mutate: (c: CaseState) => CaseState = decided, code: string = CODE) {
  const store = await openStore(`report-${++n}`);
  await store.put(mutate(newCaseState(code, false, NOW)));
  window.location.hash = `#/case/${code}/report`;
  render(<App store={store} />);
  await screen.findAllByRole('button', { name: 'Back to case' });
}

beforeEach(() => { window.location.hash = ''; });
afterEach(() => { window.location.hash = ''; });

describe('report page', () => {
  it('lists still-raised flags under Still to review when nothing is confirmed or dismissed', async () => {
    await open(c => ({ ...decided(c), flagStates: {} }));
    const paper = screen.getByRole('article', { name: 'Risk assessment report' });
    expect(within(paper).getByRole('heading', { name: /Still to review \(5\)/ })).toBeInTheDocument();
    expect(within(paper).getAllByText('TO REVIEW')).toHaveLength(5);
    expect(within(paper).getByText('Confirm or dismiss these in the console.')).toBeInTheDocument();
  });

  it('shows the recommendation, override sentence and cover line', async () => {
    await open();
    const paper = screen.getByRole('article', { name: 'Risk assessment report' });
    expect(within(paper).getByRole('heading', { name: 'Partial release' })).toBeInTheDocument();
    expect(within(paper).getAllByText('$45,500').length).toBeGreaterThan(0);
    expect(within(paper).getAllByText('$20,500').length).toBeGreaterThan(0);
    expect(within(paper).getByText('Dec 15, 2026')).toBeInTheDocument();
    expect(within(paper).getByText(`The rules suggested “${deriveCase(decided(newCaseState(CODE, false, NOW)), RULES_V1).suggestion.summary}.”`)).toBeInTheDocument();
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

const SMALL = encodeCaseCode({ version: 1, type: 'hidden-by-growth', difficulty: 'easy', size: 'small', seed: 7 });
const paperOf = () => screen.getByRole('article', { name: 'Risk assessment report' });

// Every rules flag confirmed and the rules' own suggestion chosen, so no reason is needed.
const agreeing = (c: CaseState): CaseState => {
  const flagStates = Object.fromEntries(deriveCase(c, RULES_V1).ruleFlags.map(f => [f.id, { state: 'confirmed' as const, note: '' }]));
  const { action, keep, release, reviewDate } = deriveCase({ ...c, flagStates }, RULES_V1).suggestion;
  return { ...c, flagStates, decision: { action, keep, release, reviewDate } };
};

describe('report page edge paths', () => {
  it('lists the saved activity with one rules-suggestion row after Checks ran', async () => {
    await open(c => ({
      ...decided(c),
      activity: [
        { ts: NOW, who: 'Forge', what: 'Case opened.' }, { ts: NOW, who: `Rules v${RULES_V1.version}`, what: 'Checks ran. 5 flags raised.' },
        { ts: NOW, who: 'Analyst', what: 'Analyst confirmed a flag.' },
      ],
    }));
    const rows = within(within(paperOf()).getByRole('region', { name: 'Audit trail' })).getAllByRole('row').slice(1).map(r => r.textContent);
    expect(rows).toHaveLength(4);
    expect(rows[1]).toContain('Checks ran. 5 flags raised.');
    expect(rows[2]).toContain(`Rules v${RULES_V1.version} suggested: ${deriveCase(decided(newCaseState(CODE, false, NOW)), RULES_V1).suggestion.summary}`);
  });

  it('leaves the suggestion out of the page and the JSON until a practice case is decided', async () => {
    const user = userEvent.setup();
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return 'blob:x'; });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await open(c => ({ ...decided(c), practice: true }));
    const sugg = deriveCase(decided(newCaseState(CODE, true, NOW)), RULES_V1).suggestion;
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    const json = await blobs[0]!.text();
    for (const text of [sugg.summary, sugg.basis]) {
      expect(json).not.toContain(text);
      expect(document.body.innerHTML).not.toContain(text);
    }
    expect(document.body.innerHTML).not.toContain(`Rules v${RULES_V1.version} suggested`);
    delete (URL as { createObjectURL?: unknown }).createObjectURL;
    delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
    vi.restoreAllMocks();
  });

  it('makes the reviewer optional below the second-review amount', async () => {
    const user = userEvent.setup();
    await open(agreeing, SMALL);
    expect(deriveCase(newCaseState(SMALL, false, NOW), RULES_V1).forged.trigger.heldAmount).toBeLessThan(RULES_V1.secondReviewAt);
    expect(screen.queryByRole('textbox', { name: 'Reviewer name' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Seller message read/ }));
    expect(screen.getByRole('button', { name: 'Mark case decided' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Ask anyway' }));
    expect(screen.getByRole('textbox', { name: 'Reviewer name' })).toHaveAttribute('placeholder', 'Reviewer name (optional)');
    expect(screen.getByRole('button', { name: 'Mark case decided' })).toBeEnabled();
  });

  it('keeps Mark case decided disabled when the kept amount is below the worst case', async () => {
    const user = userEvent.setup();
    await open(c => ({ ...decided(c), decision: { action: 'partial-release', keep: 2800000, release: 3800000, reviewDate: '2026-12-15' } }));
    await user.click(screen.getByRole('checkbox', { name: /Seller message read/ }));
    await user.type(screen.getByRole('textbox', { name: 'Reviewer name' }), 'Dana');
    expect(screen.getByRole('button', { name: 'Mark case decided' })).toBeDisabled();
  });

  it('keeps Mark case decided disabled once the case is signed', async () => {
    const user = userEvent.setup();
    await open(c => ({ ...decided(c), decidedAt: NOW, messageRead: true, secondReviewer: 'Dana' }));
    expect(screen.getByRole('checkbox', { name: /Seller message read/ })).toBeChecked();
    expect(screen.getByRole('textbox', { name: 'Reviewer name' })).toHaveValue('Dana');
    await user.click(screen.getByRole('button', { name: 'Mark case decided' }));
    expect(screen.getByRole('button', { name: 'Mark case decided' })).toBeDisabled();
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

describe('final review fixes', () => {
  const X3 = 'X3-G000-0N';
  const keepAll = (c: CaseState): CaseState => ({
    ...agreeing(c), decision: { action: 'partial-release', keep: 900000, release: 0, reviewDate: '2026-12-15' }, overrideReason: 'Keep it all',
  });

  it('passes "Money adds up" when the whole hold is kept and the worst case is bigger than the hold', async () => {
    await open(keepAll, X3);
    const v = deriveCase(newCaseState(X3, false, NOW), RULES_V1);
    expect(v.exposure.high).toBeGreaterThan(v.forged.trigger.heldAmount);
    const row = screen.getByText(/Money adds up/).closest('li')!;
    expect(within(row).getByRole('img')).toHaveAccessibleName('Done');
    expect(within(paperOf()).getByText(/covers the worst case/)).toBeInTheDocument();
  });

  it('stores the shown decision when signing without a saved one, and then locks the page', async () => {
    const user = userEvent.setup();
    const store = await openStore(`report-${++n}`);
    await store.put({ ...agreeing(newCaseState(CODE, false, NOW)), decision: null, overrideReason: '', messageRead: true, secondReviewer: 'Dana' });
    window.location.hash = `#/case/${CODE}/report`;
    render(<App store={store} />);
    await screen.findAllByRole('button', { name: 'Back to case' });
    await user.click(screen.getByRole('button', { name: 'Mark case decided' }));
    expect(screen.getByRole('textbox', { name: 'Reviewer name' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Message to the seller' })).toBeDisabled();
    await waitFor(async () => expect((await store.all())[0]!.decision).toMatchObject({ action: expect.any(String) }));
  });

  it('hides the past decisions of a practice case until it is decided', async () => {
    await open(c => ({ ...agreeing(c), practice: true }));
    expect(screen.queryByText('Same facts, same answer')).not.toBeInTheDocument();
    expect(screen.getByText('Revealed after you decide')).toBeInTheDocument();
  });

  it('shows past decisions on a normal case', async () => {
    await open(agreeing);
    expect(screen.getByText('Same facts, same answer')).toBeInTheDocument();
  });

  it('puts an icon in every severity chip of the rail', async () => {
    await open();
    const chips = [...document.querySelectorAll('.fls .rchip')].filter(c => !['DISMISSED', 'TO REVIEW'].includes(c.textContent ?? ''));
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) expect(chip.querySelector('svg')).not.toBeNull();
  });

  it('labels the audit times UTC', async () => {
    await open(c => ({ ...agreeing(c), activity: [{ ts: '2026-11-08T10:05:00.000Z', who: 'Sam', what: 'Did a thing' }] }));
    expect(within(paperOf()).getByText('10:05 UTC')).toBeInTheDocument();
  });
});

describe('path taken', () => {
  const answeredAll = (c: CaseState): CaseState => {
    const v = deriveCase(c, RULES_V1);
    return { ...c, playbook: { answers: expectedPath(v.playbook!, v), collapsed: false } };
  };

  it('adds section 3 Path taken and renumbers the later sections', async () => {
    await open(c => answeredAll(decided(c)));
    const paper = within(paperOf());
    expect(paper.getByRole('region', { name: 'Path taken' })).toBeInTheDocument();
    expect(paper.getByRole('heading', { name: /^3\s*Path taken/ })).toBeInTheDocument();
    for (const [no, title] of [['4', 'Release the'], ['5', 'Message to the seller'], ['7', 'Audit trail']]) {
      expect(paper.getByRole('heading', { name: new RegExp(`^${no}\s*${title}`) })).toBeInTheDocument();
    }
    expect(paper.getByText('Did sales jump recently?')).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Report contents' })).getByRole('button', { name: /3\s*Path taken/ })).toBeInTheDocument();
  });

  it('says so when no playbook step is answered', async () => {
    await open();
    expect(within(paperOf()).getByText('No playbook steps answered yet.')).toBeInTheDocument();
  });

  it('shows the stored rules version of a decided case', async () => {
    await open(c => ({ ...decided(c), decidedAt: NOW, rulesVersion: '0.9' }));
    expect(within(paperOf()).getByText(/Rules v0\.9$/)).toBeInTheDocument();
  });

  it('keeps consistency and pathConclusion out of the JSON of an undecided practice case', () => {
    const base = answeredAll(decided(newCaseState(CODE, true, NOW)));
    const v = deriveCase(base, RULES_V1);
    const json = (cs: CaseState) => exportCaseJson(v, cs, buildReport(v, cs, 'Dana', RULES_V1));
    const hidden = json(base);
    expect(hidden).not.toContain('consistency');
    expect(hidden).not.toContain('pathConclusion');
    expect(hidden).toContain('"path"');
    const shown = json({ ...base, decidedAt: NOW });
    expect(shown).toContain('"consistency"');
    expect(shown).toContain('"pathConclusion"');
    expect(json({ ...base, practice: false })).toContain('"pathConclusion"');
  });

  it('lists a mismatch against the expected path once a practice case is decided', async () => {
    const user = userEvent.setup();
    await open(c => {
      const full = answeredAll({ ...decided(c), practice: true });
      return { ...full, playbook: { answers: { ...full.playbook!.answers, jump: ['no'] }, collapsed: false } };
    });
    expect(screen.queryByText('Your path vs the expected path')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Seller message read/ }));
    await user.type(screen.getByRole('textbox', { name: 'Reviewer name' }), 'Dana');
    await user.click(screen.getByRole('button', { name: 'Mark case decided' }));
    const result = await screen.findByRole('region', { name: 'Practice result' });
    expect(within(result).getByText('Your path vs the expected path')).toBeInTheDocument();
    const row = within(result).getByText('Sales jump').closest('li')!;
    expect(row).toHaveClass('bad');
    expect(row).toHaveTextContent('Differs');
    expect(row.querySelector('svg')).not.toBeNull();
  });
});
