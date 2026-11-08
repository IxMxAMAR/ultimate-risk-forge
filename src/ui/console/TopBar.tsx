import { activeOf, useApp } from '../../app/AppContext';
import { caseHash } from '../../app/routes';
import { Button } from '../Button';
import { Icon } from '../Icon';

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

export function TopBar() {
  const { state, dispatch, view } = useApp();
  const cs = activeOf(state);
  const practice = cs?.practice ?? false;
  const report = state.view === 'report' && cs !== null;
  return (
    <header className="topbar">
      <div className="brand"><span className="mark"><Icon name="logo" style={{ color: '#fff' }} /></span>Risk Forge</div>
      {report ? <div className="crumbs">Cases <span>/</span> {view?.forged.displayId ?? cs.code} <span>/</span> <b>Report</b></div> : (
        <label className="search" role="search">
          <Icon name="search" />
          <input type="search" aria-label="Search cases" placeholder="Search cases, sellers, codes…" value={state.search} onChange={e => dispatch({ type: 'set-search', text: e.target.value })} />
          <span className="kbd">Ctrl K</span>
        </label>
      )}
      {!state.persistent && <span className="notice" role="status">Storage is blocked — this session won't be saved.</span>}
      <span className="spacer" />
      <button className="switch" aria-pressed={practice} aria-disabled="true" title="Set when the case is forged">
        <Icon name="flask" />Practice mode<span className="track" aria-hidden="true" />
      </button>
      {report && <Button icon="left" onClick={() => { window.location.hash = caseHash(cs.code); }}>Back to case</Button>}
      <div className="avatar" aria-label={`Signed in as ${initialsOf(state.analyst)}`}>{initialsOf(state.analyst)}</div>
    </header>
  );
}
