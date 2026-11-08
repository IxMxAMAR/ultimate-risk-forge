import type { CaseView } from '../../app/derive';
import { actionLabel } from '../../domain/labels';
import type { Flag } from '../../domain/types';
import { formatMoney, pct } from '../../lib/money';
import type { ReportModel } from '../../report/buildReport';
import { Icon, type IconName } from '../Icon';

export const SECTIONS = [
  { id: 'rep-rec', no: '★', title: 'Recommendation' },
  { id: 'rep-1', no: '1', title: 'What we found' },
  { id: 'rep-2', no: '2', title: 'Money at risk' },
  { id: 'rep-3', no: '3', title: 'Release the rest when' },
  { id: 'rep-4', no: '4', title: 'Message to the seller' },
  { id: 'rep-5', no: '5', title: 'Fix for everyone' },
  { id: 'rep-6', no: '6', title: 'Audit trail' },
];

const CHIP = { critical: ['d-crit', 'CRIT'], high: ['d-high', 'HIGH'], medium: ['d-med', 'MED'] } as const;

const chipOf = (f: Flag): readonly [string, string] => (f.state === 'dismissed' ? ['d-off', 'DISMISSED'] : f.state === 'raised' ? ['d-off', 'TO REVIEW'] : CHIP[f.severity]);

const attachmentIcon = (title: string): IconName => (title.startsWith('Chart') ? 'chart' : title.startsWith('Table') ? 'table' : title.startsWith('Money') ? 'calc' : 'clip');

// Left rail of the report page: contents, case facts, flags, attachments and the consistency check (ARCHITECTURE.md §6).
export function ReportRail({ v, report, active, onJump }: { v: CaseView; report: ReportModel; active: string; onJump: (id: string) => void }) {
  const { forged, stats } = v;
  const { consistency: c } = report;
  const trigger = forged.trigger.kind;
  const confirmed = v.flags.filter(f => f.state === 'confirmed').length;
  const dismissed = v.flags.filter(f => f.state === 'dismissed').length;
  const added = v.flags.filter(f => f.addedBy === 'analyst').length;
  const rows = [...c.past, { ref: c.current.ref, action: null, keptPct: c.current.keptPct, reference: false }];

  return (
    <nav className="rail" aria-label="Report contents">
      <div>
        <div className="label rail-h">In this report</div>
        <div className="toc">
          {SECTIONS.map(s => (
            <button key={s.id} className={active === s.id ? 'active' : undefined} aria-current={active === s.id ? 'true' : undefined} onClick={() => onJump(s.id)}>
              <span className="n">{s.no}</span>{s.title}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <span className="label">Case at a glance</span>
        <div className="kv"><span>Seller</span><span>{forged.subject.name}</span></div>
        <div className="kv"><span>Asked for</span><span>Release {formatMoney(forged.trigger.heldAmount)} hold</span></div>
        <div className="kv"><span>Account age</span><span className="num">{forged.subject.accountAgeMonths} mo</span></div>
        <div className="kv"><span>Sales, last 30 days</span><span className="num">{formatMoney(stats.last30Sales)}</span></div>
        <div className="kv"><span>Judged dispute rate</span><span className="num hot">{pct(stats.judgedRate)}</span></div>
      </div>

      <div className="panel">
        <span className="label">Flags in this report</span>
        <div className="fls">
          {v.flags.map(f => {
            const [cls, word] = chipOf(f);
            return (
              <div key={f.id} className={`fl${f.state === 'confirmed' ? '' : ' off'}`}>
                <span className={`rchip ${cls}`}>{word}</span>
                {f.state === 'dismissed' ? <s>{f.title}</s> : <span>{f.title}</span>}
              </div>
            );
          })}
        </div>
        <div className="fl-count">{confirmed} confirmed · {dismissed} dismissed · {added} added by analyst</div>
      </div>

      <div className="panel">
        <span className="label">Evidence attached</span>
        {report.attachments.map(a => <div key={a.title} className="att"><Icon name={attachmentIcon(a.title)} />{a.title}<span>p.{a.page}</span></div>)}
      </div>

      <div className="panel grow">
        <span className="label">Same facts, same answer</span>
        <div className="past-h">{c.past.length ? 'Earlier cases of this kind:' : 'No earlier cases of this kind yet.'}</div>
        {rows.map((r, i) => {
          const now = i === rows.length - 1;
          return (
            <div key={r.ref} className={`past${now ? ' now' : ''}`}>
              <span className="num">{r.ref}</span><span>{r.action ? actionLabel(r.action, trigger) : 'This case'}</span><b className="num">kept {r.keptPct}%</b>
              <i className="pb"><s style={{ width: `${r.keptPct}%`, ...(now ? { background: 'var(--accent)' } : r.keptPct >= 100 ? { background: 'var(--crit-text)' } : {}) }} /></i>
            </div>
          );
        })}
        {c.past.length > 0 && (
          <div className={`consist${c.inLine ? '' : ' off'}`}>
            <Icon name={c.inLine ? 'check' : 'tri'} />
            <span>{c.inLine ? 'In line with past decisions' : 'Different from past decisions'} ({c.range[0]}–{c.range[1]}%).</span>
          </div>
        )}
      </div>
    </nav>
  );
}
