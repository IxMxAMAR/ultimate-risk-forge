import { useState } from 'react';
import { activeOf, useApp } from '../../app/AppContext';
import { caseHash } from '../../app/routes';
import { holdToKeep } from '../../checks/exposure';
import { reviewDateFrom } from '../../checks/flags';
import { RULES_V1 } from '../../domain/ruleset';
import { actionLabel } from '../../domain/labels';
import type { ActionKind, Decision } from '../../domain/types';
import { formatDay } from '../../lib/dates';
import type { Cents } from '../../lib/money';
import { sellerMessage } from '../../report/buildReport';
import { Icon } from '../Icon';
import { useShortcuts } from '../useShortcuts';

const ACTIONS: ActionKind[] = ['approve', 'approve-smaller-hold', 'partial-release', 'deny', 'hold-payouts', 'refund-buyers', 'block', 'escalate'];
const HELD_IN_FULL: ActionKind[] = ['deny', 'hold-payouts', 'escalate', 'block', 'refund-buyers'];

// A partial hold between 0 and `held`: the analyst's own keep, else half the hold to the nearest $1,000 (or to the cent when that reaches 0 or `held`).
export function startingKeep(held: Cents, own: Cents): Cents {
  if (own > 0 && own < held) return own;
  const rounded = Math.round(held / 2 / 100000) * 100000;
  return rounded > 0 && rounded < held ? rounded : Math.round(held / 2);
}

export function DecisionPanel() {
  const { state, dispatch, view } = useApp();
  const cs = activeOf(state);
  const [reason, setReason] = useState(cs?.overrideReason ?? '');
  const [holdText, setHoldText] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  const hidden = cs !== null && view !== null && cs.practice && cs.decidedAt === null;
  const unchosen = hidden && cs.decision === null;
  const shown: Decision | null = !cs || !view ? null : cs.decision ?? view.suggestion;
  const differs = !!(shown && view && !hidden && (shown.action !== view.suggestion.action || shown.keep !== view.suggestion.keep));
  const needsReason = differs && reason.trim() === '';
  const canBuild = shown !== null && !unchosen && !needsReason;
  const openReport = () => { if (canBuild && cs) window.location.hash = `${caseHash(cs.code)}/report`; };
  useShortcuts({ r: openReport });

  if (!cs || !view || !shown) return null;
  const { forged, suggestion, exposure } = view;
  const held = forged.trigger.heldAmount;
  const trigger = forged.trigger.kind;

  const commit = (d: Decision, why: string) => {
    setHoldText(null);
    dispatch({ type: 'set-decision', decision: { action: d.action, keep: d.keep, release: held - d.keep, reviewDate: d.reviewDate }, held, reason: why, trigger, now: new Date().toISOString() });
  };
  // While the suggestion is hidden, the starting hold comes only from the analyst's own decision, never from the suggestion or exposure.
  const ownKeep = (): Cents => startingKeep(held, cs.decision?.keep ?? 0);
  const chooseAction = (value: string) => {
    if (value === 'suggestion') { setReason(''); commit(suggestion, ''); return; }
    const action = value as ActionKind;
    const smaller = Math.min(held, holdToKeep(exposure.high, RULES_V1));
    const keep: Cents = HELD_IN_FULL.includes(action) ? held
      : action === 'partial-release' ? (hidden ? ownKeep() : shown.keep > 0 && shown.keep < held ? shown.keep : smaller)
      : action === 'approve-smaller-hold' ? (hidden ? ownKeep() : smaller) : 0;
    commit({ action, keep, release: held - keep, reviewDate: action === 'approve' ? forged.asOf : reviewDateFrom(forged.asOf) }, reason);
  };
  const commitHold = () => {
    const dollars = parseFloat(holdText ?? '');
    setHoldText(null);
    if (!Number.isFinite(dollars)) return;
    const keep = Math.min(held, Math.max(0, Math.round(dollars * 100)));
    if (keep !== shown.keep) commit({ ...shown, keep }, reason);
  };
  const saveReason = () => { if (cs.decision && reason !== cs.overrideReason) commit(cs.decision, reason); };

  const sameAsSuggestion = !hidden && !differs && shown.action === suggestion.action && shown.keep === suggestion.keep;
  const selectValue = unchosen ? '' : sameAsSuggestion ? 'suggestion' : shown.action;

  return (
    <div className="decision">
      <div className="label">Suggested decision</div>
      <div className={`sugg${hidden ? ' hidden-sugg' : ''}`}>
        {hidden
          ? <div><b>Hidden in practice mode — make your own call</b></div>
          : <div><b>{actionLabel(suggestion.action, trigger)}</b><small>{suggestion.basis}</small></div>}
        <Icon name="shield" style={{ width: 20, height: 20, color: hidden ? 'var(--fg3)' : 'var(--crit-text)' }} />
      </div>
      <div className="fields">
        <div className="field"><div className="k">Hold</div>
          <div className="v">
            {unchosen ? '—' : (
              <><span>Keep $</span><input inputMode="decimal" aria-label="Hold amount in dollars" value={holdText ?? String(shown.keep / 100)} onChange={e => setHoldText(e.target.value)} onBlur={commitHold} onKeyDown={e => { if (e.key === 'Enter') commitHold(); }} /></>
            )}
          </div>
        </div>
        <div className="field"><div className="k">Re-review on</div>
          <div className="v">{unchosen ? '—' : <><Icon name="cal" style={{ width: 13, height: 13 }} />{formatDay(shown.reviewDate)}</>}</div>
        </div>
      </div>
      {differs && (
        <div className="reason">
          <input aria-label="Reason for changing the suggestion" placeholder="Reason for changing the suggestion" value={reason} onChange={e => setReason(e.target.value)} onBlur={saveReason} />
          {needsReason && <small role="alert">Add a reason for changing the suggestion</small>}
        </div>
      )}
      <div className="override">
        <select aria-label="Decision" value={selectValue} onChange={e => chooseAction(e.target.value)}>
          {unchosen ? <option value="" disabled>Choose a decision</option> : !hidden && <option value="suggestion">Use the suggestion</option>}
          {ACTIONS.map(a => <option key={a} value={a}>{actionLabel(a, trigger)}</option>)}
        </select>
        <button className="btn btn-ghost" aria-label="Preview message to seller" aria-expanded={preview} disabled={unchosen} onClick={() => setPreview(p => !p)}><Icon name="send" />Message</button>
      </div>
      {preview && !unchosen && (
        <div className="msg" role="region" aria-label="Message to seller">
          <pre>{cs.sellerMessage ?? sellerMessage(view, shown)}</pre>
        </div>
      )}
      <div className="final">
        <button className="btn btn-primary" disabled={!canBuild} onClick={openReport}><Icon name="file" />Build report</button>
      </div>
      <div className="hint"><span><span className="kbd">C</span> confirm</span><span><span className="kbd">D</span> dismiss</span><span><span className="kbd">E</span> evidence</span><span><span className="kbd">R</span> report</span></div>
    </div>
  );
}
