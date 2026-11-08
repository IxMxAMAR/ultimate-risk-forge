import type { CaseView } from '../../app/derive';
import type { DisputeReason } from '../../domain/types';
import { reasonLabel } from '../../domain/labels';
import { pct } from '../../lib/money';
import { Icon } from '../Icon';

const ORDER: { reason: DisputeReason; color: string }[] = [
  { reason: 'fraudulent', color: 'var(--crit)' },
  { reason: 'subscription_canceled', color: 'var(--high)' },
  { reason: 'product_unacceptable', color: 'var(--med)' },
  { reason: 'not_received', color: 'var(--fg3)' },
  { reason: 'credit_not_processed', color: 'var(--fg3)' },
];

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function ReasonsCard({ view, highlight, evidenceFor }: { view: CaseView; highlight: Set<string>; evidenceFor: string }) {
  const { reasonsJudged, outcomesJudged: o, judgedDisputes } = view.stats;
  const top = ORDER.reduce((best, r) => (reasonsJudged[r.reason] > reasonsJudged[best.reason] ? r : best), ORDER[0]!).reason;
  const on = highlight.has('reasons');
  const outcomes = [
    { word: 'Won', n: o.won, color: 'var(--ok)' }, { word: 'Lost', n: o.lost, color: 'var(--crit)' }, { word: 'Open', n: o.open, color: 'var(--border-strong)' },
  ];

  return (
    <div className={`card${on ? ' is-evidence' : ''}`} data-evidence-id="reasons">
      <div className="card-h">
        <h3>Why buyers disputed · judged sales</h3>
        {on ? <span className="evid-tag"><Icon name="eye" />Evidence for: {evidenceFor}</span> : <span className="meta">{judgedDisputes} disputes</span>}
      </div>
      <div className="hbars">
        {ORDER.map(r => {
          const n = reasonsJudged[r.reason];
          return (
            <div className="hb" key={r.reason}>
              <span>{capital(reasonLabel(r.reason))}</span>
              <div className="hb-t"><i style={{ width: judgedDisputes === 0 ? 0 : `${Math.round((n / judgedDisputes) * 100)}%`, background: r.color }} /></div>
              <span className="num">{n}</span>
            </div>
          );
        })}
      </div>
      <div className="outcome">
        <div className="label">Outcomes so far</div>
        <div className="stack" aria-label={outcomes.map(x => `${x.word} ${x.n}`).join(', ')}>
          {outcomes.map(x => <i key={x.word} style={{ flex: x.n, background: x.color }} />)}
        </div>
        <div className="stack-l">
          {outcomes.map(x => <span key={x.word}><span className="sw" style={{ background: x.color }} />{x.word} {x.n}</span>)}
          <span style={{ marginLeft: 'auto' }}>Win rate <b className="num" style={{ color: o.winRate < 0.5 ? 'var(--crit-text)' : 'var(--ok-text)' }}>{pct(o.winRate, 0)}</b></span>
        </div>
      </div>
      <div className="tip" style={{ marginTop: 12 }}>
        <Icon name="info" />
        {judgedDisputes === 0 ? <span>No disputes on sales old enough to judge yet.</span>
          : top === 'fraudulent' ? <span>Biggest reason is <b>fraudulent</b>. Extra card checks (3D Secure) would help most.</span>
          : <span>Biggest reason is <b>{reasonLabel(top)}</b>.</span>}
      </div>
    </div>
  );
}
