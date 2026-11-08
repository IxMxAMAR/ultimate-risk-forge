import type { CaseView } from '../../app/derive';
import { reasonLabel } from '../../domain/labels';
import type { Brand, Dispute } from '../../domain/types';
import { monthLabel } from '../../lib/dates';
import { formatMoney } from '../../lib/money';

const BRAND: Record<Brand, string> = { visa: 'Visa', mastercard: 'MC', amex: 'Amex', discover: 'Discover' };
const STATUS: Record<Dispute['status'], { cls: string; word: string }> = {
  open: { cls: 'high', word: 'OPEN' }, lost: { cls: 'crit', word: 'LOST' }, won: { cls: 'ok', word: 'WON' },
};

const day = (ts: string) => `${monthLabel(ts)} ${Number(ts.slice(8, 10))}`;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function LatestDisputes({ view }: { view: CaseView }) {
  const { payments, disputes } = view.forged;
  const paymentById = new Map(payments.map(p => [p.id, p]));
  const newest = [...disputes].sort((a, b) => (a.filedTs < b.filedTs ? 1 : a.filedTs > b.filedTs ? -1 : a.id < b.id ? -1 : 1));

  return (
    <div className="card">
      <div className="card-h"><h3>Latest disputes</h3><span className="meta">{disputes.length} disputes · newest first</span></div>
      <div className="scroll">
        <div>
          <table>
            <thead><tr><th>Filed</th><th className="n">Amount</th><th>Card</th><th>Reason</th><th>Bought</th><th>Status</th></tr></thead>
            <tbody>
              {newest.map(d => {
                const p = paymentById.get(d.paymentId);
                const s = STATUS[d.status];
                return (
                  <tr key={d.id}>
                    <td className="num">{day(d.filedTs)}</td>
                    <td className="n">{formatMoney(d.amount)}</td>
                    <td className="num">{BRAND[d.brand]} ••{p?.last4 ?? '—'}</td>
                    <td>{capital(reasonLabel(d.reason))}</td>
                    <td>{p ? monthLabel(p.ts) : '—'}</td>
                    <td><span className={`sev ${s.cls}`}>{s.word}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
