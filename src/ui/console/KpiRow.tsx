import type { CaseView } from '../../app/derive';
import { RULES_V1 } from '../../domain/ruleset';
import { pct } from '../../lib/money';
import { Icon, type IconName } from '../Icon';

const { limits, minBrandPayments } = RULES_V1;
const BULLET_MAX = 0.035;

type Level = 'crit' | 'high' | 'med' | 'ok';
const CHIP: Record<Level, { icon: IconName; word: string }> = {
  crit: { icon: 'oct', word: 'CRIT' }, high: { icon: 'tri', word: 'HIGH' }, med: { icon: 'tri', word: 'MED' }, ok: { icon: 'check', word: 'OK' },
};

function Chip({ level }: { level: Level }) {
  return <span className={`sev ${level}`}><Icon name={CHIP[level].icon} />{CHIP[level].word}</span>;
}

const bulletPos = (rate: number) => `${Math.min(100, (rate / BULLET_MAX) * 100)}%`;

export function KpiRow({ view, highlight }: { view: CaseView; highlight: Set<string> }) {
  const { stats, flags } = view;
  const misleading = flags.some(f => f.id === 'rate-hidden-by-growth' && f.state !== 'dismissed');
  const refundsLow = flags.some(f => f.id === 'refunds-low-disputes-high' && f.state !== 'dismissed');
  const mc = stats.byBrandJudged.find(r => r.brand === 'mastercard');
  const mcRate = mc && mc.payments >= minBrandPayments ? mc.rate : NaN;
  const judgedLevel: Level | null = !Number.isFinite(stats.judgedRate) ? null : stats.judgedRate >= limits.visa ? 'crit' : stats.judgedRate >= 0.01 ? 'high' : 'ok';
  const mcLevel: Level | null = !Number.isFinite(mcRate) ? null : mcRate >= limits.mcHecm ? 'crit' : mcRate >= limits.mcEcm ? 'high' : 'ok';
  const judgedFill = judgedLevel === 'crit' ? 'var(--crit)' : judgedLevel === 'high' ? 'var(--high)' : 'var(--ok)';

  return (
    <div className="kpis">
      <div className={`kpi${misleading ? ' mutedv' : ''}`}>
        <div className="k">Last-30-day rate {misleading && <span className="sev med">MISLEADING</span>}</div>
        <div className="v">{pct(stats.rate30d)}</div>
        <div className="s num">{stats.disputes30d} disputes / {stats.payments30d.toLocaleString('en-US')} payments</div>
      </div>
      <div className={`kpi${judgedLevel === 'crit' ? ' crit' : ''}`}>
        <div className="k">Rate on judged sales {judgedLevel && <Chip level={judgedLevel} />}</div>
        <div className="v">{pct(stats.judgedRate)}</div>
        <div className="bullet" aria-hidden="true">
          <span className="fill" style={{ width: Number.isFinite(stats.judgedRate) ? bulletPos(stats.judgedRate) : 0, background: judgedFill }} />
          <span className="mk" style={{ left: bulletPos(limits.visa) }} />
          <span className="mk" style={{ left: bulletPos(limits.mcHecm) }} />
        </div>
        <div className="bullet-l"><span>0</span><span>{pct(limits.visa)} Visa</span><span>{pct(limits.mcHecm)} MC</span></div>
      </div>
      <div className={`kpi${mcLevel === 'crit' ? ' crit' : ''}`}>
        <div className="k">Mastercard, judged {mcLevel && <Chip level={mcLevel} />}</div>
        <div className="v">{pct(mcRate)}</div>
        <div className="s">
          {mcLevel === 'crit' ? <>Over the {pct(limits.mcHecm)} <span className="term" title="Mastercard's 'High Excessive Chargeback' tier. Fines start in month 2 and climb every month you stay over.">excessive tier</span></>
            : mcLevel === 'high' ? `Over the ${pct(limits.mcEcm)} line`
            : mcLevel === 'ok' ? `Under the ${pct(limits.mcEcm)} line`
            : 'Not enough payments to judge'}
        </div>
      </div>
      <div className={`kpi${highlight.has('kpi:refund-rate') ? ' is-evidence' : ''}`} data-evidence-id="kpi:refund-rate">
        <div className="k">Refund rate {refundsLow && <Chip level="med" />}</div>
        <div className="v" style={refundsLow ? { color: 'var(--med-text)' } : undefined}>{pct(stats.refundRate)}</div>
        <div className="s">{refundsLow ? 'Unhappy buyers go to their bank, not the seller' : 'Share of payments refunded'}</div>
      </div>
    </div>
  );
}
