import { activeOf, useApp } from '../../app/AppContext';
import { formatDay } from '../../lib/dates';
import { formatMoney } from '../../lib/money';

export function CaseHeader() {
  const { state, view } = useApp();
  const cs = activeOf(state);
  const flag = view?.flags.find(f => f.id === state.selectedFlagId);
  const young = flag?.evidence.ids.includes('kpi:account-age') ? ' is-evidence' : '';
  if (!view || !cs) return <section className="casehead" aria-label="Case summary"><span className="case-sub">Open or forge a case to begin.</span></section>;
  const { forged, stats } = view;
  const held = formatMoney(forged.trigger.heldAmount);
  const status = cs.decidedAt ? { cls: 'done', word: 'Decided' }
    : cs.decision || view.flags.some(f => f.state !== 'raised') ? { cls: 'progress', word: 'In progress' } : { cls: 'new', word: 'New' };
  return (
    <section className="casehead" aria-label="Case summary">
      <div className="ch-main">
        <div className="seller-av" aria-hidden="true">{forged.subject.initials}</div>
        <div>
          <div className="case-id">{forged.displayId} · Opened {formatDay(cs.openedAt.slice(0, 10))}</div>
          <div className="case-title">{forged.subject.name}</div>
          <div className="case-sub">Asks to release a <b>{held}</b> fixed hold early</div>
        </div>
      </div>
      <div className="stat"><span className="k">Money at stake</span><span className="v big">{held}</span></div>
      <div className={`stat${young}`} data-evidence-id="kpi:account-age"><span className="k">Account age</span><span className="v">{forged.subject.accountAgeMonths} mo</span></div>
      <div className="stat"><span className="k">Sales, last 30 days</span><span className="v">{formatMoney(stats.last30Sales)}</span></div>
      <div className={`stat${young}`} data-evidence-id="kpi:account-age"><span className="k">Growth vs prior month</span><span className="v hot">{Number.isFinite(stats.growth) ? `${stats.growth.toFixed(1)}×` : '—'}</span></div>
      <span className="spacer" />
      <span className={`status ${status.cls}`}><span className="dot" />{status.word}</span>
    </section>
  );
}
