import type { PathCompareRow } from '../playbooks/types';
import { Icon } from './Icon';
import './pathRows.css';

// The analyst's path against the expected one, shared by the playbook bar and the practice result (ARCHITECTURE.md §6).
export function PathRows({ rows }: { rows: PathCompareRow[] }) {
  return (
    <ul className="pcmp">
      {rows.map(r => (
        <li key={r.stepId} className={r.ok ? 'ok' : 'bad'}>
          <b>{r.title}</b>
          <span>Yours: {r.yours} · Expected: {r.expected}</span>
          <span className="pmark"><Icon name={r.ok ? 'check' : 'x'} />{r.ok ? 'Matches' : 'Differs'}</span>
        </li>
      ))}
    </ul>
  );
}
