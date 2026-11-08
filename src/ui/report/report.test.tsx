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
    expect(within(paper).getByText('The rules suggested “Partial release, keep $45,000.”')).toBeInTheDocument();
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
        { ts: NOW, who: 'Forge', what: 'Case opened.' }, { ts: NOW, who: 'Rules v1.1', what: 'Checks ran. 5 flags raised.' },
        { ts: NOW, who: 'Analyst', what: 'Analyst confirmed a flag.' },
      ],
    }));
    const rows = within(within(paperOf()).getByRole('region', { name: 'Audit trail' })).getAllByRole('row').slice(1).map(r => r.textContent);
    expect(rows).toHaveLength(4);
    expect(rows[1]).toContain('Checks ran. 5 flags raised.');
    expect(rows[2]).toContain('Rules v1.1 suggested: Partial release, keep $45,000');
  });

  it('leaves the suggestion out of the page and the JSON until a practice case is decided', async () => {
    const user = userEvent.setup();
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return 'blob:x'; });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await open(c => ({ ...decided(c), practice: true }));
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    const json = await blobs[0]!.text();
    for (const text of ['Partial release, keep $45,000', 'Confirmed risk; the hold is more than the worst case']) {
      expect(json).not.toContain(text);
      expect(document.body.innerHTML).not.toContain(text);
    }
    expect(document.body.innerHTML).not.toContain('Rules v1.1 suggested');
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
    expect(json.rulesVersion).toBe('1.1');
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
      expect(paper.getByRole('heading', { name: new RegExp(`^${no}\\s*${title}`) })).toBeInTheDocument();
    }
    expect(paper.getByText('Did sales jump recently?')).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Report contents' })).getByRole('button', { name: /3\s*Path taken/ })).toBeInTheDocument();
  });

  it('names rail item 4 like the paper heading', async () => {
    await open(c => ({ ...decided(c), decision: { action: 'approve', keep: 0, release: 6600000, reviewDate: '2026-11-08' } }));
    const rail = within(screen.getByRole('navigation', { name: 'Report contents' }));
    expect(rail.getByRole('button', { name: /4\s*Conditions to watch/ })).toBeInTheDocument();
    expect(within(paperOf()).getByRole('heading', { name: /^4\s*Conditions to watch/ })).toBeInTheDocument();
  });

  it('says so when no playbook step is answered', async () => {
    await open();
    expect(within(paperOf()).getByText('No playbook steps answered yet.')).toBeInTheDocument();
  });

  it('shows the stored rules version of a decided case', async () => {
    await open(c => ({ ...decided(c), decidedAt: NOW, rulesVersion: '0.9' }));
    expect(within(paperOf()).getByText(/Rules v0\.9$/)).toBeInTheDocument();
    const row = within(within(paperOf()).getByRole('region', { name: 'Audit trail' })).getByText(/Rules v0\.9 suggested/);
    expect(row).toBeInTheDocument();
  });

  it('marks a path row whose flag was changed outside the playbook', async () => {
    await open(c => {
      const full = answeredAll(decided(c));
      return { ...full, flagStates: { ...full.flagStates, 'rate-hidden-by-growth': { state: 'dismissed', note: '' } } };
    });
    const path = within(screen.getByRole('region', { name: 'Path taken' }));
    const row = path.getByText('Is the rate on older sales at least double the 30-day rate?').closest('li')!;
    expect(within(row).getByText('changed outside the playbook')).toBeInTheDocument();
    expect(row.querySelector('svg')).not.toBeNull();
    expect(path.getAllByText('changed outside the playbook')).toHaveLength(1);
  });

  it('shows rules v1.0 and its suggestion for a case signed before rules v1.1', async () => {
    const user = userEvent.setup();
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return 'blob:x'; });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await open(c => ({
      ...c, decidedAt: NOW, activity: [{ ts: NOW, who: 'Forge', what: 'Case opened.' }, { ts: NOW, who: 'Rules v1.0', what: 'Checks ran: 5 flags raised' }],
      flagStates: { 'rate-hidden-by-growth': { state: 'confirmed', note: '' }, 'mc-over-limit': { state: 'confirmed', note: '' } },
      decision: { action: 'deny', keep: 6400000, release: 0, reviewDate: '2026-12-15' },
    }), STARTER_CODES[1]);
    expect(within(paperOf()).getAllByText(/Rules v1\.0$/)).toHaveLength(2);
    expect(within(within(paperOf()).getByRole('region', { name: 'Audit trail' })).getByText('Rules v1.0 suggested: Deny, keep all $64,000')).toBeInTheDocument();
    expect(within(paperOf()).queryByText(/The rules suggested/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    expect(await blobs[0]!.text()).toMatch(/"rulesVersion":\s*"1\.0"/);
    delete (URL as { createObjectURL?: unknown }).createObjectURL;
    delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
    vi.restoreAllMocks();
  });

  it('exports a null pathConclusion for a partial walk on a normal case', () => {
    const cs = { ...decided(newCaseState(CODE, false, NOW)), playbook: { answers: { jump: ['yes'], hidden: ['yes'] }, collapsed: false } };
    const v = deriveCase(cs, RULES_V1);
    expect(exportCaseJson(v, cs, buildReport(v, cs, 'Dana', RULES_V1))).toMatch(/"pathConclusion":\s*null/);
  });

  it('exports the stored rules version', () => {
    const cs = { ...answeredAll(decided(newCaseState(CODE, false, NOW))), rulesVersion: '0.9' };
    const v = deriveCase(cs, RULES_V1);
    const json = exportCaseJson(v, cs, buildReport(v, cs, 'Dana', RULES_V1));
    expect(json).toMatch(/"rulesVersion":\s*"0\.9"/);
  });

  it('leaves the conclusion, expected path and suggestion out of the page of an undecided practice case', async () => {
    await open(c => answeredAll({ ...decided(c), practice: true }));
    const html = document.body.innerHTML;
    const hiddenText = ['The playbook ends with', 'Partial release, keep $45,000', 'Confirmed risk; the hold is more than the worst case', 'Expected'];
    for (const text of hiddenText) expect(html).not.toContain(text);
    for (const el of document.querySelectorAll('[title], [aria-label]')) {
      const attrs = `${el.getAttribute('title') ?? ''} ${el.getAttribute('aria-label') ?? ''}`;
      for (const text of hiddenText) expect(attrs).not.toContain(text);
    }
    const path = within(screen.getByRole('region', { name: 'Path taken' }));
    expect(path.getByText('Did sales jump recently?')).toBeInTheDocument();
    expect(path.getAllByText(/^Yes — /).length).toBeGreaterThan(0);
  });

  it('makes the export itself drop the suggestion from an undecided practice case', () => {
    const base = answeredAll({ ...decided(newCaseState(CODE, true, NOW)), decision: { action: 'deny', keep: 6600000, release: 0, reviewDate: '2026-12-15' } });
    const v = deriveCase(base, RULES_V1);
    expect(v.suggestion.summary).toBe('Partial release, keep $45,000');
    const json = (cs: CaseState) => exportCaseJson(v, cs, buildReport(v, cs, 'Dana', RULES_V1));
    const hidden = json(base);
    for (const text of ['Partial release, keep $45,000', 'consistency', 'pathConclusion']) expect(hidden).not.toContain(text);
    const shown = json({ ...base, decidedAt: NOW });
    for (const text of ['Partial release, keep $45,000', 'consistency', 'pathConclusion']) expect(shown).toContain(text);
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
