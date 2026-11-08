import { useApp } from '../../app/AppContext';
import { Icon } from '../Icon';

// Plan 1 has the Disputes tab only; the other data tabs arrive with their screens.
export function DataTabs() {
  const { state, dispatch, view } = useApp();
  if (!view) return null;
  const flagCount = view.flags.filter(f => f.evidence.tab === 'disputes' && f.state !== 'dismissed').length;
  return (
    <div className="nav">
      <div className="label">This case's data</div>
      <a href="#/" className={`active${flagCount > 0 ? ' flagged' : ''}`} aria-current={state.tab === 'disputes' ? 'page' : undefined} onClick={e => { e.preventDefault(); dispatch({ type: 'set-tab', tab: 'disputes' }); }}>
        <Icon name="shield" />Disputes<span className="count">{view.forged.disputes.length} · {flagCount} {flagCount === 1 ? 'flag' : 'flags'}</span>
      </a>
    </div>
  );
}
