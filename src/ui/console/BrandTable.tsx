import type { CaseView } from '../../app/derive';
import { brandGroup } from '../../checks/disputeMath';
import { networkFines } from '../../checks/exposure';
import { RULES_V1 } from '../../domain/ruleset';
import { monthLabel } from '../../lib/dates';
import { formatMoney, pct } from '../../lib/money';
import { Icon } from '../Icon';

const { limits } = RULES_V1;

type Group = 'visa' | 'mastercard' | 'other';
const GROUPS: { group: Group; name: string; limit: string }[] = [
  { group: 'visa', name: 'Visa', limit: pct(limits.visa) },
  { group: 'mastercard', name: 'Mastercard', limit: pct(limits.mcHecm) },
  { group: 'other', name: 'Amex & others', limit: 'varies' },
];

const thin = (group: Group, payments: number) => group !== 'other' && payments < RULES_V1.minBrandPayments;

function Status({ group, rate, payments }: { group: Group; rate: number; payments: number }) {
  if (!Number.isFinite(rate)) return <span>—</span>;
  if (thin(group, payments)) return <span className="sev na"><Icon name="info" />NOT ENOUGH DATA</span>;
  if (group === 'mastercard' && rate >= limits.mcHecm) return <span className="sev crit"><Icon name="oct" />EXCESSIVE</span>;
  if ((group === 'mastercard' && rate >= limits.mcEcm) || (group === 'visa' && rate >= limits.visa)) return <span className="sev high"><Icon name="tri" />OVER</span>;
  if (group === 'other' && rate >= limits.visa) return <span className="sev med"><Icon name="tri" />REVIEW</span>;
  return <span className="sev ok"><Icon name="check" />OK</span>;
}

export function BrandTable({ view, highlight, evidenceFor }: { view: CaseView; highlight: Set<string>; evidenceFor: string }) {
  const { stats } = view;
  const first = stats.judgedMonths[0];
  const last = stats.judgedMonths[stats.judgedMonths.length - 1];
  const range = first === undefined || last === undefined ? '' : ` (${monthLabel(first)}–${monthLabel(last)})`;
  const rows = GROUPS.map(g => {
    const mine = stats.byBrandJudged.filter(r => brandGroup(r.brand) === g.group);
    const payments = mine.reduce((sum, r) => sum + r.payments, 0);
    const disputes = mine.reduce((sum, r) => sum + r.disputes, 0);
    return { ...g, payments, disputes, rate: payments === 0 ? NaN : disputes / payments };
  });
  const fines = networkFines(stats, RULES_V1);
  const ladder = fines.tier === 'none' ? null : RULES_V1.mcFines[fines.tier];
  const steps = ladder && [`Month 1 · ${formatMoney(ladder[0])}`, `Month 2 · ${formatMoney(ladder[1])}`, `Month 3 · ${formatMoney(ladder[2])}`, `Months 4–6 · ${formatMoney(ladder[3])} each`];
  const lit = rows.some(r => highlight.has(`brand:${r.group}`));

  return (
    <div className="card">
      <div className="card-h">
        <h3>By card brand · sales old enough to judge{range}</h3>
        {lit ? <span className="evid-tag"><Icon name="eye" />Evidence for: {evidenceFor}</span>
          : <span className="meta">{stats.judgedPayments.toLocaleString('en-US')} payments · {stats.judgedDisputes} disputes</span>}
      </div>
      <table>
        <thead><tr><th>Card brand</th><th className="n">Payments</th><th className="n">Disputes</th><th className="n">Rate</th><th className="n">Network limit</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map(r => {
            const on = highlight.has(`brand:${r.group}`);
            const hot = r.group === 'mastercard' && !thin(r.group, r.payments) && r.rate >= limits.mcHecm;
            return (
              <tr key={r.group} data-evidence-id={`brand:${r.group}`} className={on ? 'hl is-evidence' : undefined}>
                <td>{r.name}</td>
                <td className="n">{r.payments.toLocaleString('en-US')}</td>
                <td className="n">{r.disputes}</td>
                <td className="n" style={hot ? { color: 'var(--crit-text)', fontWeight: 600 } : undefined}>{pct(r.rate)}</td>
                <td className="n">{r.limit}</td>
                <td><Status group={r.group} rate={r.rate} payments={r.payments} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="foot">
        <div className="label">If nothing changes</div>
        <div className="foot-row">
          <b>Mastercard</b>
          {steps ? <div className="steps">{steps.map((s, i) => <span key={s} className={i > 0 && (ladder?.[i] ?? 0) > 0 ? 'hot' : undefined}>{s}</span>)}</div> : <span>Mastercard: under its limits</span>}
        </div>
        <div className="foot-row"><b>Visa</b><span>Charges fees on sellers over {pct(limits.visa)} (amount not published)</span></div>
        <div className="foot-row"><b>Who pays</b><span>The seller. Network fines pass through to the business that caused them.</span></div>
      </div>
    </div>
  );
}
