import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { CaseView } from '../../app/derive';
import { deriveCase } from '../../app/derive';
import { disputeStats } from '../../checks/disputeMath';
import { RULES_V1 } from '../../domain/ruleset';
import { STARTER_CODES } from '../../forge/starters';
import { pct } from '../../lib/money';
import { newCaseState, openStore } from '../../persist/db';
import { App } from '../../app/App';
import { DisputesTab, type DisputesMode } from './DisputesTab';

const viewOf = (code: string): CaseView => deriveCase(newCaseState(code, false, '2026-11-08T10:00:00.000Z'), RULES_V1);
const [EASY, , HARD] = STARTER_CODES;

function Harness({ view, highlight = new Set<string>() }: { view: CaseView; highlight?: Set<string> }) {
  const [mode, setMode] = useState<DisputesMode>('purchase');
  return <DisputesTab view={view} mode={mode} onMode={setMode} highlight={highlight} />;
}

const bars = () => [...document.querySelectorAll<SVGRectElement>('rect[data-evidence-id^="month:"]')];

describe('Disputes tab', () => {
  it('draws one bar per month; only immature months say too new', () => {
    const view = viewOf(HARD);
    render(<Harness view={view} />);
    expect(bars().map(b => b.getAttribute('data-evidence-id'))).toEqual(view.stats.byMonth.map(m => `month:${m.month}`));
    const chart = screen.getByRole('img', { name: /bar chart/i });
    expect(within(chart as unknown as HTMLElement).getAllByText(/too new/)).toHaveLength(view.stats.immatureMonths.length);
    expect(within(chart as unknown as HTMLElement).getAllByText(/pays/)).toHaveLength(view.stats.judgedMonths.length);
    expect(screen.getByText('Visa limit 1.5%')).toBeInTheDocument();
    expect(screen.getByText('Mastercard excessive 3.0%')).toBeInTheDocument();
  });

  it('highlights exactly the judged-month bars for the hidden-by-growth flag', () => {
    const view = viewOf(HARD);
    const flag = view.flags.find(f => f.id === 'rate-hidden-by-growth')!;
    render(<Harness view={view} highlight={new Set(flag.evidence.ids)} />);
    const lit = bars().filter(b => b.classList.contains('is-evidence')).map(b => b.getAttribute('data-evidence-id'));
    expect(lit).toEqual(view.stats.judgedMonths.map(m => `month:${m}`));
    expect(document.querySelectorAll('tr.hl')).toHaveLength(0);
  });

  it('marks the last-30-day rate misleading only while the flag is not dismissed', () => {
    const view = viewOf(HARD);
    const { unmount } = render(<Harness view={view} />);
    expect(screen.getByText('MISLEADING')).toBeInTheDocument();
    unmount();
    const dismissed = { ...view, flags: view.flags.map(f => (f.id === 'rate-hidden-by-growth' ? { ...f, state: 'dismissed' as const } : f)) };
    render(<Harness view={dismissed} />);
    expect(screen.queryByText('MISLEADING')).not.toBeInTheDocument();
  });

  it('shows the Mastercard row with an EXCESSIVE chip at 3% or more, and the fine ladder', () => {
    const view = viewOf(EASY);
    const mc = view.stats.byBrandJudged.find(r => r.brand === 'mastercard')!;
    expect(mc.rate).toBeGreaterThanOrEqual(0.03);
    render(<Harness view={view} />);
    const row = document.querySelector('tr[data-evidence-id="brand:mastercard"]') as HTMLElement;
    expect(within(row).getByText('Mastercard')).toBeInTheDocument();
    expect(within(row).getByText(pct(mc.rate))).toBeInTheDocument();
    expect(within(row).getByText('EXCESSIVE')).toBeInTheDocument();
    expect(screen.getByText('Months 4–6 · $10,000 each')).toBeInTheDocument();
    expect(screen.getByText(/amount not published/)).toBeInTheDocument();
  });

  it('switches the bars to filed rates in Last 30 days mode', async () => {
    const view = viewOf(HARD);
    render(<Harness view={view} />);
    const heights = () => bars().map(b => b.getAttribute('height'));
    const before = heights();
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Last 30 days' }));
    expect(heights()).not.toEqual(before);
    expect(screen.getByRole('tab', { name: 'Last 30 days' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByText(/filed/).length).toBeGreaterThan(0);
  });

  it('shows — for a brand group with no payments', () => {
    const base = viewOf(HARD);
    const forged = {
      ...base.forged,
      payments: base.forged.payments.filter(p => p.brand !== 'amex' && p.brand !== 'discover'),
    };
    const ids = new Set(forged.payments.map(p => p.id));
    forged.disputes = base.forged.disputes.filter(d => ids.has(d.paymentId));
    const view = { ...base, forged, stats: disputeStats(forged, RULES_V1) };
    render(<Harness view={view} />);
    const row = screen.getByText('Amex & others').closest('tr') as HTMLElement;
    expect(within(row).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('lists every dispute newest first', () => {
    const view = viewOf(HARD);
    render(<Harness view={view} />);
    expect(screen.getByText(`${view.forged.disputes.length} disputes · newest first`)).toBeInTheDocument();
    const rows = document.querySelectorAll('.scroll tbody tr');
    expect(rows).toHaveLength(view.forged.disputes.length);
  });

  it('mounts in the centre column of the app', async () => {
    const store = await openStore('disputes-app');
    await store.put(newCaseState(HARD, false, '2026-11-08T10:00:00.000Z'));
    window.location.hash = `#/case/${HARD}`;
    render(<App store={store} />);
    await screen.findByText('Dispute rate by month of purchase');
    expect(bars().length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.is-evidence')).toHaveLength(0);
    window.location.hash = '';
  });
});
