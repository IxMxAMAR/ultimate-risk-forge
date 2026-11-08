import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { deriveCase } from '../../app/derive';
import { RULES_V1 } from '../../domain/ruleset';
import { STARTER_CODES } from '../../forge/starters';
import { newCaseState } from '../../persist/db';
import { expectedPath, walk } from '../../playbooks/engine';
import { playbookFor } from '../../playbooks';
import type { PlaybookAnswers } from '../../playbooks/types';
import { PlaybookBar, type PlaybookBarProps } from './PlaybookBar';

// Holds the picks the console hook keeps, so the multi-select clicks behave as in the app.
function Bar(p: PlaybookBarProps) {
  const [picked, onPick] = useState(p.picked);
  return <PlaybookBar {...p} picked={picked} onPick={onPick} />;
}

const view = deriveCase(newCaseState(STARTER_CODES[0], false, '2026-11-08T10:00:00.000Z'), RULES_V1);
const pb = playbookFor(view.forged.actualType)!;
const expected = expectedPath(pb, view);
const all: PlaybookAnswers = { jump: ['yes'], hidden: ['yes'], brands: ['none'], refunds: ['no'], explained: ['no'], money: ['covers'] };

function props(answers: PlaybookAnswers, over: Partial<PlaybookBarProps> = {}): PlaybookBarProps {
  return {
    title: pb.title, walk: walk(pb, view, answers), collapsed: false, readOnly: false, picked: walk(pb, view, answers).current?.chosen ?? [], showData: false, expected: null, conclusion: null, compare: false,
    onPick: vi.fn(), onAnswer: vi.fn(), onReopen: vi.fn(), onLook: vi.fn(), onAcceptAll: vi.fn(), onUseDecision: vi.fn(), onCollapse: vi.fn(), ...over,
  };
}
const toBrands: PlaybookAnswers = { jump: ['yes'], hidden: ['yes'] };

describe('PlaybookBar', () => {
  it('shows the current question and the step count', () => {
    render(<Bar {...props({})} />);
    expect(screen.getByText('Did sales jump recently?')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 6')).toBeInTheDocument();
    expect(screen.getByText('Playbook · Early hold release')).toBeInTheDocument();
  });

  it('lists every brand answer as a button and sends the picks on Next', () => {
    const p = props(toBrands);
    render(<Bar {...p} />);
    for (const name of [/Mastercard 3%\+/, /Mastercard 1\.5–3%/, /Visa 1\.5%\+/, /None/, /Not enough data/]) expect(screen.getByRole('button', { name })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Visa 1\.5%\+/ }));
    fireEvent.click(screen.getByRole('button', { name: /Mastercard 3%\+/ }));
    expect(p.onAnswer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(p.onAnswer).toHaveBeenCalledWith('brands', ['visa', 'mc3']);
  });

  it('answers a single-choice step on click', () => {
    const p = props({});
    render(<Bar {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(p.onAnswer).toHaveBeenCalledWith('jump', ['no']);
  });

  it('marks the expected answers only when showData', () => {
    const { rerender } = render(<Bar {...props({})} />);
    expect(screen.queryByText('Data says')).toBeNull();
    rerender(<Bar {...props({}, { showData: true, expected })} />);
    expect(screen.getAllByText('Data says').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: "Accept the data's answers" })).toBeInTheDocument();
  });

  it('renders no data, conclusion or suggestion text in practice before deciding', () => {
    const { container } = render(<Bar {...props(all)} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/Data says|Accept the data|Use this decision/);
    expect(html).not.toContain(view.suggestion.summary);
    expect(html).not.toContain(view.suggestion.basis);
    expect(html).not.toContain('Sales jump: ');
    expect(screen.getByText('All steps answered — make your call in the decision panel.')).toBeInTheDocument();
  });

  it('shows the conclusion card when given one', () => {
    const p = props(all, { conclusion: view.suggestion });
    render(<Bar {...p} />);
    expect(screen.getByText(view.suggestion.summary)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use this decision' }));
    expect(p.onUseDecision).toHaveBeenCalled();
  });

  it('collapses to one line', () => {
    const p = props({}, { collapsed: true });
    const { container } = render(<Bar {...p} />);
    expect(screen.getByText('Playbook · Step 1 of 6: Sales jump')).toBeInTheDocument();
    expect(container.querySelector('.steps6')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    expect(p.onCollapse).toHaveBeenCalledWith(false);
  });

  it('names the step in progress on the collapsed line, and the playbook once every step is answered', () => {
    const { unmount } = render(<Bar {...props(toBrands, { collapsed: true })} />);
    expect(screen.getByText('Playbook · Step 3 of 6: Card brands')).toBeInTheDocument();
    unmount();
    render(<Bar {...props(all, { collapsed: true })} />);
    expect(screen.getByText('Playbook · Step 6 of 6: Early hold release')).toBeInTheDocument();
  });

  it('reopens a done step and flags drift', () => {
    const w = walk(pb, view, { jump: ['yes'] });
    w.steps[0]!.drift = true;
    const p = props({}, { walk: w });
    render(<Bar {...p} />);
    expect(screen.getByText(/changed outside the playbook/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sales jump' }));
    expect(p.onReopen).toHaveBeenCalledWith('jump');
  });

  it('greys skipped steps', () => {
    render(<Bar {...props({ jump: ['no'] })} />);
    expect(screen.getAllByTitle('skipped — not needed')).toHaveLength(2);
  });

  it('disables every control when read-only', () => {
    const { unmount } = render(<Bar {...props({ jump: ['yes'] }, { readOnly: true, showData: true, expected })} />);
    expect(screen.getByRole('button', { name: 'Sales jump' })).toBeDisabled();
    expect(screen.getByRole('button', { name: "Accept the data's answers" })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Yes/ })).toBeDisabled();
    unmount();
    render(<Bar {...props(toBrands, { readOnly: true })} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^None/ })).toBeDisabled();
  });

  it('disables Use this decision when read-only', () => {
    render(<Bar {...props(all, { readOnly: true, conclusion: view.suggestion })} />);
    expect(screen.getByRole('button', { name: 'Use this decision' })).toBeDisabled();
  });

  it('lists a step the analyst skipped but the expected path has, as a mismatch', () => {
    expect(expected.jump).toEqual(['yes']);
    render(<Bar {...props({ jump: ['no'] }, { compare: true, expected })} />);
    const row = screen.getByText('Hidden rate', { selector: 'b' }).closest('li')!;
    expect(row).toHaveTextContent('Yours: skipped');
    expect(row).toHaveTextContent('Expected: Yes');
    expect(row).toHaveTextContent('Differs');
  });

  it('marks a step that matches the expected path', () => {
    render(<Bar {...props({ jump: ['yes'] }, { compare: true, expected })} />);
    const row = screen.getByText('Sales jump', { selector: 'b' }).closest('li')!;
    expect(row).toHaveTextContent('Matches');
  });

  it('opens a look-at chip', () => {
    const p = props(toBrands);
    render(<Bar {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Brand table' }));
    expect(p.onLook).toHaveBeenCalledWith(expect.objectContaining({ label: 'Brand table' }));
  });
});
