import { useEffect, useState } from 'react';
import { activeOf, useApp } from '../../app/AppContext';
import type { Flag, Severity } from '../../domain/types';
import { Icon } from '../Icon';
import { SeverityChip } from '../SeverityChip';
import { useShortcuts } from '../useShortcuts';
import { ActivityLog } from './ActivityLog';

const SEVERITIES: Severity[] = ['critical', 'high', 'medium'];

function AddFlagForm({ evidence, onAdd, onCancel }: { evidence: Flag['evidence']; onAdd: (f: Flag) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<Severity>('high');
  const [note, setNote] = useState('');
  const submit = () => onAdd({ id: '', kind: 'analyst', severity, title: title.trim(), why: '', evidence, state: 'confirmed', note, addedBy: 'analyst' });
  return (
    <form className="flag addform" aria-label="Add my own flag" onSubmit={e => { e.preventDefault(); submit(); }}>
      <input className="line" aria-label="Flag title" placeholder="What did you find?" value={title} onChange={e => setTitle(e.target.value)} />
      <select className="line" aria-label="Flag severity" value={severity} onChange={e => setSeverity(e.target.value as Severity)}>
        {SEVERITIES.map(s => <option key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</option>)}
      </select>
      <textarea className="note" aria-label="Flag note" placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} />
      <div className="acts">
        <button type="submit" className="btn btn-primary btn-sm" disabled={title.trim() === ''}>Add flag</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export function FlagsPanel() {
  const { state, dispatch, view } = useApp();
  const cs = activeOf(state);
  const [adding, setAdding] = useState(false);
  const flags = view?.flags ?? [];
  const selected = flags.find(f => f.id === state.selectedFlagId);
  const now = () => new Date().toISOString();

  // A case opens with its first flag still to review selected, so the evidence highlight shows at once.
  useEffect(() => {
    if (state.selectedFlagId !== null) return;
    const first = flags.find(f => f.state === 'raised');
    if (first) dispatch({ type: 'select-flag', id: first.id });
  }, [state.selectedFlagId, flags, dispatch]);

  const setFlagState = (f: Flag, next: Flag['state']) => dispatch({ type: 'set-flag-state', id: f.id, state: next, title: f.title, now: now() });
  const showEvidence = (f: Flag) => {
    dispatch({ type: 'select-flag', id: f.id });
    dispatch({ type: 'set-tab', tab: f.evidence.tab });
    const target = f.evidence.ids.map(id => document.querySelector(`[data-evidence-id="${id}"]`)).find(el => el !== null);
    target?.scrollIntoView({ block: 'center' });
  };
  useShortcuts({
    j: () => dispatch({ type: 'move-flag', dir: 1, ids: flags.map(f => f.id) }),
    k: () => dispatch({ type: 'move-flag', dir: -1, ids: flags.map(f => f.id) }),
    c: () => { if (selected && selected.state !== 'confirmed') setFlagState(selected, 'confirmed'); },
    d: () => { if (selected && selected.state !== 'dismissed') setFlagState(selected, 'dismissed'); },
    e: () => { if (selected) showEvidence(selected); },
    'ctrl+k': () => document.querySelector<HTMLInputElement>('.topbar input[type="search"]')?.focus(),
  });

  if (!view || !cs) return null;
  const confirmed = flags.filter(f => f.state === 'confirmed').length;
  const dismissed = flags.filter(f => f.state === 'dismissed').length;
  const toReview = flags.length - confirmed - dismissed;
  const reviewed = flags.length - toReview;

  return (
    <>
      <div className="side-h">
        <div className="row"><h2>Flags</h2><span className="kbd">J / K to move</span></div>
        <div className="prog" role="img" aria-label={`${reviewed} of ${flags.length} flags reviewed`}><i style={{ width: `${flags.length === 0 ? 0 : Math.round(reviewed / flags.length * 100)}%` }} /></div>
        <div className="counts">
          <span>{flags.length} raised</span><span style={{ color: 'var(--ok-text)' }}>{confirmed} confirmed</span><span>{dismissed} dismissed</span><span>{toReview} to review</span>
        </div>
      </div>
      <div className="flags">
        {flags.map(f => {
          const sel = f.id === state.selectedFlagId;
          const cls = ['flag', sel ? 'sel' : 'collapsed', f.state !== 'raised' ? f.state : ''].filter(Boolean).join(' ');
          return (
            <article key={f.id} className={cls} aria-current={sel ? 'true' : undefined}>
              <div className="top">
                <SeverityChip level={f.severity} />
                {f.state === 'confirmed' && <span className="state-ok"><Icon name="check" style={{ width: 13, height: 13 }} />Confirmed</span>}
                {f.state === 'dismissed' && <span className="state-no"><Icon name="x" style={{ width: 13, height: 13 }} />Dismissed</span>}
                {f.state === 'raised' && <span className="state-todo">To review</span>}
                {f.state !== 'raised' && <button className="btn btn-ghost btn-sm" onClick={() => setFlagState(f, 'raised')}>Undo</button>}
              </div>
              <div className="title"><button aria-pressed={sel} onClick={() => dispatch({ type: 'select-flag', id: f.id })}>{f.title}</button></div>
              {f.why && <div className="why">{f.why}</div>}
              {sel && f.state === 'raised' && (
                <div className="acts">
                  <button className="btn btn-ghost btn-sm yes" onClick={() => setFlagState(f, 'confirmed')}><Icon name="check" />Confirm</button>
                  <button className="btn btn-ghost btn-sm no" onClick={() => setFlagState(f, 'dismissed')}><Icon name="x" />Dismiss</button>
                  <span className="spacer" />
                  <button className="btn btn-ghost btn-sm" aria-label="Show evidence" onClick={() => showEvidence(f)}><Icon name="eye" />Evidence</button>
                </div>
              )}
              {sel && f.state !== 'raised' && (
                <div className="acts"><span className="spacer" /><button className="btn btn-ghost btn-sm" aria-label="Show evidence" onClick={() => showEvidence(f)}><Icon name="eye" />Evidence</button></div>
              )}
              {sel && <textarea className="note" aria-label="Your note" value={f.note} onChange={e => dispatch({ type: 'set-note', id: f.id, note: e.target.value })} />}
            </article>
          );
        })}
        {adding
          ? <AddFlagForm
              evidence={selected ? { tab: selected.evidence.tab, ids: selected.evidence.ids } : { tab: 'disputes', ids: [] }}
              onAdd={flag => { dispatch({ type: 'add-analyst-flag', flag, now: now() }); setAdding(false); }}
              onCancel={() => setAdding(false)} />
          : <button className="addflag" onClick={() => setAdding(true)}><Icon name="pen" />Add my own flag</button>}
        <ActivityLog entries={cs.activity} />
      </div>
    </>
  );
}
