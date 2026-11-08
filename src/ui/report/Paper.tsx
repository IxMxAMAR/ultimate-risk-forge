import type { CaseView } from '../../app/derive';
import { formatDay } from '../../lib/dates';
import { formatMoney, formatMoneyShort } from '../../lib/money';
import type { Flag } from '../../domain/types';
import type { CaseState } from '../../persist/db';
import type { ReportModel } from '../../report/buildReport';
import { Icon } from '../Icon';
import { keepTitle } from './ReportRail';

const BADGE = { critical: { cls: 'crit', icon: 'oct', word: 'CRITICAL' }, high: { cls: 'high', icon: 'tri', word: 'HIGH' }, medium: { cls: 'med', icon: 'tri', word: 'MEDIUM' } } as const;

const RULE_LEAD = 'Proposed rule:';

export const hhmm = (ts: string): string => `${ts.slice(11, 16)} UTC`;

function Finding({ flag, last }: { flag: Flag; last?: boolean }) {
  const dismissed = flag.state === 'dismissed';
  const raised = flag.state === 'raised';
  const badge = BADGE[flag.severity];
  return (
    <div className={`find${dismissed ? ' is-dismissed' : last ? ' last' : ''}`}>
      {dismissed || raised ? <span className="pc off">{dismissed ? 'DISMISSED' : 'TO REVIEW'}</span> : <span className={`pc ${badge.cls}`}><Icon name={badge.icon} />{badge.word}</span>}
      <b>{flag.title}</b>
      <p>{flag.note === '' ? flag.why : <>{flag.why} Analyst note: {flag.note}</>}</p>
    </div>
  );
}

function Note({ lead, rest }: { lead: string; rest: string }) {
  return <div className="pnote"><div><b>{lead}</b> {rest}</div></div>;
}

// The white report paper; sections 1–7 are ported from the report mockup (ARCHITECTURE.md §6).
export function Paper({ v, cs, report, hidden }: { v: CaseView; cs: CaseState; report: ReportModel; hidden: boolean }) {
  const { header, recommendation: rec, findings, money, fix } = report;
  const { forged } = v;
  const held = forged.trigger.heldAmount;
  const place = (cents: number) => `${Math.min(100, Math.max(0, cents / held * 100))}%`;
  const rule = fix.text.indexOf(RULE_LEAD);
  const split = report.fallback.indexOf(': ');
  const audit = [...report.audit];
  if (!hidden) {
    const ran = Math.max(0, audit.findIndex(a => a.what.startsWith('Checks ran')) + 1);
    audit.splice(ran, 0, { ts: audit[ran - 1]?.ts ?? cs.openedAt, who: 'Rules', what: `Rules ${header.rules} suggested: ${v.suggestion.summary}` });
  }

  return (
    <article className="paper" aria-label="Risk assessment report">
      <header className="p-head">
        <div>
          <div className="p-brand"><span className="mark"><Icon name="logo" style={{ color: '#fff', width: 14, height: 14 }} /></span>RISK FORGE · RISK ASSESSMENT REPORT</div>
          <div className="p-title">{header.title}</div>
          <div className="p-sub">{header.subtitle}</div>
        </div>
        <div className="pmeta">
          <div><span>Case</span><b className="num">{header.caseId}</b></div>
          <div><span>Date</span><b>{header.date}</b></div>
          <div><span>Analyst</span><b>{header.analyst}</b></div>
          <div><span>Rules</span><b className="num">{header.rules}</b></div>
          <div><span>Status</span><b>{header.status}</b></div>
          <div><span>Data</span><b>{header.data}</b></div>
        </div>
      </header>

      <section className="rec" id="rep-rec" aria-label="Recommendation">
        <div className="rec-top">
          <div><div className="lbl">Recommendation</div><h2>{rec.label}</h2></div>
          <span className={`conf${rec.confidence === 'high' ? '' : ' mid'}`}>
            <Icon name="check" />{rec.confidence === 'high' ? 'High confidence · all evidence present' : 'Medium confidence · some flags still to review'}
          </span>
        </div>
        <div className="nums">
          <div><span>Release now</span><b>{formatMoney(rec.release)}</b></div>
          <div><span>Keep on hold</span><b>{formatMoney(rec.keep)}</b></div>
          <div><span>Review again on</span><b>{formatDay(rec.reviewDate)}</b></div>
        </div>
        {rec.override && (
          <div className="ovr"><Icon name="pen" /><div>
            <b>The rules suggested “{rec.override.suggested}.”</b> The analyst changed it.{rec.override.reason.trim() === '' ? '' : ` Reason: ${rec.override.reason}`}
          </div></div>
        )}
      </section>

      <div className="cols">
        <section className="sec" id="rep-1">
          <h3><span className="no">1</span>What we found <span className="aside">{findings.confirmed.length} confirmed · {findings.dismissed.length} dismissed</span></h3>
          <div className="findings">
            {findings.confirmed.map((f, i) => <Finding key={f.id} flag={f} last={i === findings.confirmed.length - 1} />)}
            {findings.dismissed.map(f => <Finding key={f.id} flag={f} />)}
            {findings.toReview.length > 0 && (
              <>
                <h4 className="to-review">Still to review ({findings.toReview.length})</h4>
                {findings.toReview.map((f, i) => <Finding key={f.id} flag={f} last={i === findings.toReview.length - 1} />)}
                <p className="to-review-note">Confirm or dismiss these in the console.</p>
              </>
            )}
          </div>
        </section>

        <section className="sec" id="rep-2">
          <h3><span className="no">2</span>Money at risk <span className="aside">next 90 days</span></h3>
          <table>
            <thead><tr><th>Where the money could go</th><th className="n">Low</th><th className="n">High</th></tr></thead>
            <tbody>
              {money.rows.map(r => (
                <tr key={r.key}>
                  <td>{r.label}{r.detail && (r.key === 'new' ? <><br /><span className="small">{r.detail}</span></> : <> <span className="small">{r.detail}</span></>)}</td>
                  <td className="n">{formatMoney(r.low)}</td><td className="n">{formatMoney(r.high)}</td>
                </tr>
              ))}
              <tr className="total"><td>Total</td><td className="n">{formatMoney(money.low)}</td><td className="n">{formatMoney(money.high)}</td></tr>
            </tbody>
          </table>
          <div className="cover">
            <div className="cover-bar" role="img" aria-label={`Money at risk ${formatMoney(money.low)} to ${formatMoney(money.high)}; hold kept ${formatMoney(money.keep)}; hold today ${formatMoney(money.held)}`}>
              <span className="range" style={{ left: place(money.low), width: `${Math.max(0, Math.min(100, money.high / held * 100) - Math.min(100, money.low / held * 100))}%` }} />
              <span className="keep" style={{ left: place(money.keep) }} />
            </div>
            <div className="cover-l"><span>$0</span><span>risk {formatMoneyShort(money.low)}–{formatMoneyShort(money.high)}</span><span>keep {formatMoneyShort(money.keep)}</span><span>{formatMoneyShort(money.held)}</span></div>
            {money.covers
              ? <div className="ok-line"><Icon name="check" />The {formatMoney(money.keep)} kept covers the worst case with a {money.bufferPct}% buffer.</div>
              : <div className="ok-line bad"><Icon name="tri" />The {formatMoney(money.keep)} kept is below the worst case of {formatMoney(money.high)}.</div>}
          </div>
          <Note lead="How we estimated:" rest={money.howEstimated} />
        </section>
      </div>

      <section className="sec path" id="rep-3" aria-label="Path taken">
        <h3><span className="no">3</span>Path taken <span className="aside">{report.path.length} steps answered</span></h3>
        {report.path.length === 0 ? <p className="path-empty">No playbook steps answered yet.</p> : (
          <ol className="path-list">
            {report.path.map((p, i) => (
              <li key={p.question}>
                <span className="num path-no">{i + 1}</span>
                <div><b>{p.question}</b><span>{p.answer}</span></div>
                <span className="path-sets">{p.sets.map(t => <span key={t} className={`pc ${t.startsWith('Confirmed') ? 'high' : 'off'}`}><Icon name={t.startsWith('Confirmed') ? 'check' : 'x'} />{t}</span>)}</span>
              </li>
            ))}
          </ol>
        )}
        {report.pathConclusion && <div className="path-end"><Icon name="check" /><span>The playbook ends with: <b>{report.pathConclusion}</b></span></div>}
      </section>

      <div className="cols">
        <section className="sec" id="rep-4">
          <h3><span className="no">4</span>{keepTitle(money.keep)}</h3>
          <ul className="conds">
            {report.conditions.map(c => <li key={c}><span className="box" /><span>{c}</span></li>)}
          </ul>
          <Note lead={`${report.fallback.slice(0, split)}:`} rest={report.fallback.slice(split + 2)} />
        </section>

        <section className="sec" id="rep-5">
          <h3><span className="no">5</span>Message to the seller <span className="aside">ready to send</span></h3>
          <div className="letter">
            {report.message.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </section>
      </div>

      <section className="policy" id="rep-6" aria-label="Fix for everyone">
        <span className="ic"><Icon name="bulb" /></span>
        <div>
          <h4><span className="num">6</span>Fix for everyone</h4>
          <p>{fix.text.slice(0, rule)}<b>Proposed rule:</b>{fix.text.slice(rule + RULE_LEAD.length)}</p>
        </div>
        <div className="pstat"><b>~{fix.affected}</b>sellers this would affect<br />(Forge estimate)</div>
      </section>

      <section className="sec audit" id="rep-7" aria-label="Audit trail">
        <h3><span className="no">7</span>Audit trail <span className="aside">same facts → same answer</span></h3>
        <table>
          <thead><tr><th>Time</th><th>Who</th><th>What happened</th></tr></thead>
          <tbody>
            {audit.map((a, i) => <tr key={i}><td className="num">{hhmm(a.ts)}</td><td>{a.who}</td><td>{a.what}</td></tr>)}
          </tbody>
        </table>
      </section>

      <footer className="p-foot"><span>{report.footer}</span><span>All data in this case is fictional.</span><span>Page 1 of 4 · evidence on pages 2–4</span></footer>
    </article>
  );
}
