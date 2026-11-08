import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { CaseCodeError, decodeCaseCode, encodeCaseCode } from '../../domain/caseCode';
import { forgeCase } from '../../forge/forge';
import { STARTER_CODES } from '../../forge/starters';
import { formatMoney } from '../../lib/money';
import { newCaseState, openStore, type Store } from '../../persist/db';
import { CASE_TYPE_CARDS } from './caseTypeCards';

let n = 0;
async function seededStore(): Promise<Store> {
  const store = await openStore(`forge-${++n}`);
  await store.put(newCaseState(STARTER_CODES[1], false, '2026-11-02T10:00:00.000Z'));
  return store;
}

beforeEach(() => { window.location.hash = ''; });
afterEach(() => { window.location.hash = ''; });

async function openModal(store?: Store) {
  const user = userEvent.setup();
  render(<App store={store ?? await seededStore()} />);
  await user.click(await screen.findByRole('button', { name: /New case/ }));
  const dialog = await screen.findByRole('dialog');
  return { user, dialog };
}

const cards = (dialog: HTMLElement) => [...dialog.querySelectorAll<HTMLButtonElement>('button.type')];
const codeInput = () => screen.getByLabelText('Case code') as HTMLInputElement;

describe('Forge modal', () => {
  it('lists the 12 case types and only Hidden by growth and Surprise me are playable', async () => {
    const { dialog } = await openModal();
    expect(CASE_TYPE_CARDS).toHaveLength(12);
    const all = cards(dialog);
    expect(all).toHaveLength(12);
    const enabled = all.filter(c => c.getAttribute('aria-disabled') !== 'true').map(c => c.textContent);
    expect(all.filter(c => c.getAttribute('aria-disabled') === 'true')).toHaveLength(10);
    expect(enabled).toHaveLength(2);
    expect(enabled[0]).toContain('Hidden by growth');
    expect(enabled[1]).toContain('Surprise me');
    expect(within(dialog).getAllByText('Coming soon')).toHaveLength(10);
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('New case from the Forge');
  });

  it('ignores clicks on coming-soon cards and filters the grid by tag', async () => {
    const { user, dialog } = await openModal();
    const before = codeInput().value;
    await user.click(within(dialog).getByRole('button', { name: /Forged statement/ }));
    expect(codeInput().value).toBe(before);
    expect(within(dialog).getByRole('button', { name: /Hidden by growth/ })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(dialog).getByRole('button', { name: 'Disputes' }));
    expect(cards(dialog)).toHaveLength(12);
    expect(cards(dialog).filter(c => c.classList.contains('off')).length).toBe(9);
    expect(cards(dialog).filter(c => !c.classList.contains('off')).map(c => c.querySelector('b')!.textContent)).toEqual(['Hidden by growth', 'Refund-for-hire ring', 'Billing time-zone bug']);
    const dimmed = within(dialog).getByRole('button', { name: /Surprise me/ });
    expect(dimmed).toHaveAttribute('aria-disabled', 'true');
    expect(dimmed).toHaveAttribute('tabindex', '-1');
    await user.click(dimmed);
    expect(within(dialog).getByRole('button', { name: /Hidden by growth/ })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(dialog).getByRole('button', { name: 'All 12' }));
    expect(cards(dialog).some(c => c.classList.contains('off'))).toBe(false);
  });

  it('builds a code from Hard, Large and the dice', async () => {
    const { user, dialog } = await openModal();
    await user.click(within(dialog).getByRole('tab', { name: 'Hard' }));
    await user.click(within(dialog).getByRole('tab', { name: 'Large' }));
    await user.click(within(dialog).getByRole('button', { name: 'New random code' }));
    expect(decodeCaseCode(codeInput().value)).toMatchObject({ type: 'hidden-by-growth', difficulty: 'hard', size: 'large' });
  });

  it('follows a typed code and shows a typo message that disables Forge case', async () => {
    const { user, dialog } = await openModal();
    await user.clear(codeInput());
    await user.type(codeInput(), 'VT-G24B-KD');
    expect(within(dialog).getByRole('tab', { name: 'Hard' })).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).getByRole('button', { name: /Forge case/ })).toBeEnabled();
    await user.clear(codeInput());
    await user.type(codeInput(), 'PD-009R-HG');
    expect(within(dialog).getByText(/Typo in the code/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Forge case/ })).toBeDisabled();
    expect(() => decodeCaseCode('PD-009R-HG')).toThrow(CaseCodeError);
  });

  it('says a valid code of an unavailable type is coming soon', async () => {
    const { user, dialog } = await openModal();
    const code = encodeCaseCode({ version: 1, type: 'forged-statement', difficulty: 'easy', size: 'small', seed: 5 });
    await user.clear(codeInput());
    await user.type(codeInput(), code);
    expect(within(dialog).getByText('This kind of case is coming soon')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Forge case/ })).toBeDisabled();
  });

  it('previews the forged case, and hides every row for Surprise me', async () => {
    const { user, dialog } = await openModal();
    const forged = forgeCase(codeInput().value);
    const row = (label: string) => [...dialog.querySelectorAll<HTMLElement>('.prow')].find(r => r.textContent!.startsWith(label))!;
    expect(row('Payments')).toHaveTextContent(forged.payments.length.toLocaleString('en-US'));
    expect(row('Disputes')).toHaveTextContent(String(forged.disputes.length));
    expect(row('Hold under review')).toHaveTextContent(formatMoney(forged.trigger.heldAmount));
    expect(row('Warning signs hidden')).toHaveTextContent(String(forged.groundTruth.planted.length));
    expect(row('Innocent look-alikes')).toHaveTextContent(String(forged.groundTruth.lookAlikes.length));
    expect(row('Time to solve')).toHaveTextContent('~10 min');
    expect(within(dialog).getByText(forged.story)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Surprise me/ }));
    expect(within(dialog).getAllByText('Hidden until you investigate')).toHaveLength(6);
    expect(dialog.querySelector('.story')).toHaveTextContent('Any kind of case. You find out what it is by investigating.');
  });

  it('forges a practice case, opens it and closes', async () => {
    const store = await seededStore();
    const { user, dialog } = await openModal(store);
    const code = codeInput().value;
    expect(within(dialog).getByRole('switch', { name: 'Practice mode' })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: /Forge case/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.location.hash).toBe(`#/case/${code}`);
    await waitFor(async () => {
      const saved = (await store.all()).find(c => c.code === code);
      expect(saved).toMatchObject({ practice: true });
      expect(saved!.activity.map(a => a.what)).toEqual([
        `Case ${forgeCase(code).displayId} opened by the Forge`,
        expect.stringMatching(/^Checks ran: \d+ flags raised$/),
      ]);
    });
  });

  it('opens an existing case instead of adding a duplicate', async () => {
    const store = await seededStore();
    const { user, dialog } = await openModal(store);
    await user.clear(codeInput());
    await user.type(codeInput(), STARTER_CODES[1]);
    await user.click(within(dialog).getByRole('button', { name: /Forge case/ }));
    expect(window.location.hash).toBe(`#/case/${STARTER_CODES[1]}`);
    expect(document.querySelectorAll('button.case')).toHaveLength(1);
  });

  it('submits with Enter in the code field', async () => {
    const store = await seededStore();
    const { user } = await openModal(store);
    const code = codeInput().value;
    await user.click(codeInput());
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.location.hash).toBe(`#/case/${code}`);
  });

  it('submits with Enter as soon as the modal opens', async () => {
    const { user } = await openModal();
    const code = codeInput().value;
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.location.hash).toBe(`#/case/${code}`);
  });

  it('leaves Enter to Cancel, so it closes without forging', async () => {
    const { user, dialog } = await openModal();
    within(dialog).getByRole('button', { name: 'Cancel' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.location.hash).toBe('');
  });

  it('wraps Tab and Shift+Tab inside the dialog', async () => {
    const { user, dialog } = await openModal();
    const items = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]), input')];
    items.at(-1)!.focus();
    await user.tab();
    expect(items[0]).toHaveFocus();
    await user.tab({ shift: true });
    expect(items.at(-1)).toHaveFocus();
  });

  it('returns focus to the New case button after closing', async () => {
    const { user } = await openModal();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /New case/ })).toHaveFocus();
  });

  it('copies the canonical code and disables Copy while the code has an error', async () => {
    const { user, dialog } = await openModal();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const code = codeInput().value;
    await user.click(within(dialog).getByRole('button', { name: 'Copy code' }));
    expect(writeText).toHaveBeenCalledWith(code);
    await user.type(codeInput(), 'X');
    expect(within(dialog).getByRole('button', { name: 'Copy code' })).toBeDisabled();
  });

  it('closes with Escape, Cancel and the close button, and leaves the #/forge route', async () => {
    const { user } = await openModal();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /New case/ }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /New case/ }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    window.location.hash = '#/forge';
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.location.hash).not.toBe('#/forge');
  });
});

describe('Forge modal seed', () => {
  it('rerolls the seed when Surprise me is picked', async () => {
    const { user, dialog } = await openModal();
    const roll = vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(a: T): T => { (a as unknown as Uint32Array)[0] = 0x123456; return a; });
    await user.click(within(dialog).getByRole('button', { name: /Surprise me/ }));
    roll.mockRestore();
    expect(decodeCaseCode(codeInput().value)).toMatchObject({ type: 'surprise', seed: 0x123456 });
  });
});
