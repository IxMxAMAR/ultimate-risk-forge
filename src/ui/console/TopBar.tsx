import { activeOf, useApp } from '../../app/AppContext';
import { Icon } from '../Icon';

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

export function TopBar() {
  const { state, dispatch } = useApp();
  const practice = activeOf(state)?.practice ?? false;
  return (
    <header className="topbar">
      <div className="brand"><span className="mark"><Icon name="logo" style={{ color: '#fff' }} /></span>Risk Forge</div>
      <label className="search" role="search">
        <Icon name="search" />
        <input type="search" aria-label="Search cases" placeholder="Search cases, sellers, codes…" value={state.search} onChange={e => dispatch({ type: 'set-search', text: e.target.value })} />
        <span className="kbd">Ctrl K</span>
      </label>
      {!state.persistent && <span className="notice" role="status">Storage is blocked — this session won't be saved.</span>}
      <span className="spacer" />
      <button className="switch" aria-pressed={practice} aria-disabled="true" title="Set when the case is forged">
        <Icon name="flask" />Practice mode<span className="track" aria-hidden="true" />
      </button>
      <div className="avatar" aria-label={`Signed in as ${initialsOf(state.analyst)}`}>{initialsOf(state.analyst)}</div>
    </header>
  );
}
