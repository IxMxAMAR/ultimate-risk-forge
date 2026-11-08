import type { CaseView } from '../../app/derive';
import { RULES_V1 } from '../../domain/ruleset';
import { monthLabel } from '../../lib/dates';
import { pct } from '../../lib/money';
import { Icon } from '../Icon';
import type { DisputesMode } from './DisputesTab';

const { limits } = RULES_V1;
const W = 680, LEFT = 48, RIGHT = 670, TOP = 20, BASE = 200;
const BAR_MAX = 72;

const barFill = (rate: number, judged: boolean) =>
  !judged ? 'url(#hatch)' : rate >= limits.visa ? '#EF4444' : rate >= 0.01 ? '#F97316' : '#334155';

// Dispute rate per month as an SVG bar chart: judged months solid by severity, immature months hatched (ARCHITECTURE.md §6).
export function MonthChart({ view, mode, highlight, evidenceFor }: { view: CaseView; mode: DisputesMode; highlight: Set<string>; evidenceFor: string }) {
  const rows = view.stats.byMonth;
  const rateOf = (m: (typeof rows)[number]) => (mode === 'filed' ? m.filedRate : m.rate);
  const top = Math.max(0.035, 1.15 * Math.max(0, ...rows.map(m => rateOf(m)).filter(Number.isFinite)));
  const y = (rate: number) => BASE - (rate / top) * (BASE - TOP);
  const slot = (RIGHT - LEFT) / Math.max(1, rows.length);
  const barW = Math.min(BAR_MAX, slot * 0.62);
  const centre = (i: number) => LEFT + slot * (i + 0.5);
  const grid = Array.from({ length: Math.floor(top * 100) + 1 }, (_, i) => i);
  const lit = rows.some(m => highlight.has(`month:${m.month}`));
  const summary = rows.map(m => `${monthLabel(m.month)} ${pct(rateOf(m))}${m.judged ? '' : ' (too new)'}`).join(', ');

  return (
    <div className="card">
      <div className="card-h">
        <h3>{mode === 'filed' ? 'Disputes filed per month, against that month’s payments' : 'Dispute rate by month of purchase'}</h3>
        {lit && <span className="evid-tag"><Icon name="eye" />Evidence for: {evidenceFor}</span>}
      </div>
      <div className="legend">
        <span><span className="sw" style={{ background: '#EF4444' }} />Old enough to judge</span>
        <span><span className="sw" style={{ background: 'repeating-linear-gradient(45deg,#334155 0 3px,#1A2236 3px 6px)' }} />Too new to judge</span>
        <span><svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke="#94A3B8" strokeWidth="2" strokeDasharray="4 3" /></svg>Card-network limits</span>
      </div>
      <svg className="chart" viewBox={`0 0 ${W} 250`} role="img" aria-label={`Bar chart. ${summary}. Visa limit ${pct(limits.visa)}, Mastercard excessive tier ${pct(limits.mcHecm)}.`}>
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#1A2236" /><rect width="3" height="6" fill="#334155" /></pattern>
        </defs>
        <g fontFamily="Fira Code" fontSize="11" fill="#94A3B8">
          {grid.map(g => <text key={g} x="40" y={y(g / 100) + 4} textAnchor="end">{g}%</text>)}
        </g>
        <g stroke="#1F2A3D">{grid.map(g => <line key={g} x1={LEFT} x2={RIGHT} y1={y(g / 100)} y2={y(g / 100)} />)}</g>
        {rows.map((m, i) => {
          const rate = rateOf(m);
          const h = Number.isFinite(rate) ? BASE - y(rate) : 0;
          const on = highlight.has(`month:${m.month}`);
          return (
            <rect key={m.month} data-evidence-id={`month:${m.month}`} className={on ? 'is-evidence' : undefined}
              x={centre(i) - barW / 2} y={BASE - h} width={barW} height={h} rx={h < 14 ? 3 : 4} fill={barFill(rate, m.judged)}
              stroke={on ? '#FACC15' : undefined} strokeWidth={on ? 2 : undefined} />
          );
        })}
        <line x1={LEFT} x2={RIGHT} y1={y(limits.visa)} y2={y(limits.visa)} stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="5 4" />
        <text x={RIGHT - 2} y={y(limits.visa) - 6} textAnchor="end" fontFamily="Fira Sans" fontSize="11" fill="#CBD5E1">Visa limit {pct(limits.visa)}</text>
        <line x1={LEFT} x2={RIGHT} y1={y(limits.mcHecm)} y2={y(limits.mcHecm)} stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="5 4" />
        <text x={RIGHT - 2} y={y(limits.mcHecm) - 6} textAnchor="end" fontFamily="Fira Sans" fontSize="11" fill="#CBD5E1">Mastercard excessive {pct(limits.mcHecm)}</text>
        <g fontFamily="Fira Code" fontSize="12" fontWeight="600" textAnchor="middle">
          {rows.map((m, i) => {
            const rate = rateOf(m);
            if (!Number.isFinite(rate)) return <text key={m.month} x={centre(i)} y={BASE - 6} fill="#94A3B8">—</text>;
            const inside = BASE - y(rate) >= 28;
            return <text key={m.month} x={centre(i)} y={inside ? y(rate) + 20 : y(rate) - 6} fill={!inside ? '#94A3B8' : !m.judged ? '#94A3B8' : rate >= 0.01 ? '#0B1120' : 'var(--fg)'}>{pct(rate)}</text>;
          })}
        </g>
        <g fontFamily="Fira Sans" fontSize="12" fill="#CBD5E1" textAnchor="middle">
          {rows.map((m, i) => <text key={m.month} x={centre(i)} y="220">{monthLabel(m.month)}</text>)}
        </g>
        <g fontFamily="Fira Code" fontSize="10.5" fill="#94A3B8" textAnchor="middle">
          {rows.map((m, i) => (
            <text key={m.month} x={centre(i)} y="236">
              {m.judged ? `${m.payments.toLocaleString('en-US')} pays${mode === 'filed' ? ' · filed' : ''}` : `${m.payments.toLocaleString('en-US')}${mode === 'filed' ? '' : ' · too new'}`}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
}
