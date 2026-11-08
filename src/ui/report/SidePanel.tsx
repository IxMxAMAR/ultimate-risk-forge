import { useState } from 'react';
import { useApp } from '../../app/AppContext';
import type { CaseView } from '../../app/derive';
import { RULES_V1 } from '../../domain/ruleset';
import { formatMoney } from '../../lib/money';
import type { CaseState } from '../../persist/db';
import { scoreCase } from '../../practice/score';
import type { ReportModel } from '../../report/buildReport';
import { initialsOf } from '../console/TopBar';
import { Button } from '../Button';
import { Icon } from '../Icon';
import { downloadText, exportCaseJson } from './exportJson';
import { hhmm } from './Paper';
import { PracticeResult } from './PracticeResult';

const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

function Tick({ ok }: { ok: boolean }) {
  return <span className={`tick ${ok ? 'y' : 'n'}`} role="img" aria-label={ok ? 'Done' : 'Not done'}>{ok && <Icon name="check" />}</span>;
}

// Right rail of the report page: sign-off, seller message, the checks before deciding, exports and Mark case decided (ARCHITECTURE.md §6).
export function SidePanel({ v, cs, report, hidden }: { v: CaseView; cs: CaseState; report: ReportModel; hidden: boolean }) {
  const { state, dispatch } = useApp();
  const [asked, setAsked] = useState(false);
  const [copied, setCopied] = useState(false);
  const { forged, suggestion, exposure } = v;
  const d = cs.decision ?? suggestion;
  const signed = cs.decidedAt !== null;
  const held = forged.trigger.heldAmount;
  const secondRequired = held >= RULES_V1.secondReviewAt;
  const secondShown = secondRequired || asked || cs.secondReviewer !== '';
  const differs = d.action !== suggestion.action || d.keep !== suggestion.keep;

  const checks = [
    { ok: !v.flags.some(f => f.state === 'raised'), text: `All ${v.flags.length} flags reviewed` },
    { ok: hidden || !differs || cs.overrideReason.trim() !== '', text: hidden ? 'Reason given where needed' : 'Reason given for changing the suggestion' },
    { ok: d.action !== 'partial-release' || report.money.covers, text: 'Money adds up (hold ≥ worst case)' },
  ];
  const reviewerOk = !secondRequired || cs.secondReviewer.trim() !== '';
  const canDecide = !signed && checks.every(c => c.ok) && cs.messageRead && reviewerOk;

  const markDecided = () => {
    const score = cs.practice ? scoreCase(forged, v.flags.filter(f => f.addedBy === 'rules'), cs.analystFlags, d, exposure.high) : null;
    dispatch({ type: 'mark-decided', now: new Date().toISOString(), score });
  };
  const copy = () => {
    void navigator.clipboard?.writeText(report.message);
    setCopied(true);
  };

  return (
    <aside className="side" aria-label="Sign off and send">
      <div className="panel signoff">
        <span className="label">Sign-off</span>
        <div className="who">
          <span className="avatar">{initialsOf(state.analyst)}</span>
          <div>
            <b>{signed ? `${state.analyst} · Signed` : state.analyst}</b>
            <small>{signed && cs.decidedAt ? `Analyst · ${hhmm(cs.decidedAt)}` : 'Not signed yet'}</small>
          </div>
        </div>
        <div className="second">
          <span>{secondRequired ? `Second review: required from ${formatMoney(RULES_V1.secondReviewAt)}` : `Second review: not needed under ${formatMoney(RULES_V1.secondReviewAt)}`}</span>
          {!secondShown && <button className="btn btn-ghost" onClick={() => setAsked(true)}><Icon name="user" />Ask anyway</button>}
        </div>
        {secondShown && (
          <input className="reviewer" aria-label="Reviewer name" placeholder={secondRequired ? 'Reviewer name (required)' : 'Reviewer name (optional)'} value={cs.secondReviewer} onChange={e => dispatch({ type: 'set-second-reviewer', name: e.target.value })} />
        )}
      </div>

      <div className="panel rmsg">
        <span className="label">Edit message to the seller</span>
        <textarea aria-label="Message to the seller" value={report.message} onChange={e => dispatch({ type: 'set-seller-message', text: e.target.value })} />
        <div className="meta2"><span>Plain language · {wordCount(report.message)} words</span><span>Changes update the report</span></div>
        <div className="mrow"><Button style={{ flex: 1 }} icon="copy" onClick={copy}>{copied ? 'Copied' : 'Copy message'}</Button></div>
      </div>

      {signed && cs.score
        ? <PracticeResult score={cs.score} suggested={suggestion.summary} />
        : (
          <div className="panel">
            <span className="label">Before you send</span>
            <ul className="check">
              {checks.map(c => <li key={c.text}><Tick ok={c.ok} /><span>{c.text}</span></li>)}
              <li><label>
                <input type="checkbox" checked={cs.messageRead} onChange={e => dispatch({ type: 'set-message-read', read: e.target.checked })} />
                <span className={`tick ${cs.messageRead ? "y" : "n"}`} aria-hidden="true">{cs.messageRead && <Icon name="check" />}</span><span>Seller message read through</span>
              </label></li>
            </ul>
          </div>
        )}

      <div className="panel">
        <span className="label">Export</span>
        <div className="exports">
          <Button icon="down" onClick={() => window.print()}>PDF</Button>
          <Button icon="print" onClick={() => window.print()}>Print</Button>
          <Button icon="code" onClick={() => downloadText(`${forged.displayId}.json`, exportCaseJson(v, cs, report))}>JSON</Button>
        </div>
        <div className="private"><Icon name="lock" />Everything stays on this computer.</div>
      </div>

      <div className="rfinal"><Button variant="primary" icon="check" disabled={!canDecide} onClick={markDecided}>Mark case decided</Button></div>
    </aside>
  );
}
