import { useState } from 'react';
import { activeOf, useApp } from '../../app/AppContext';
import { deriveCase, type CaseView } from '../../app/derive';
import { caseHash } from '../../app/routes';
import { RULES_V1 } from '../../domain/ruleset';
import { normalizeCode } from '../../lib/base32';
import { formatMoney, pct } from '../../lib/money';
import type { CaseState } from '../../persist/db';
import { Button } from '../Button';
import { SeverityChip, type SeverityLevel } from '../SeverityChip';

type Filter = 'open' | 'decided' | 'all';
const FILTERS: { id: Filter; label: string }[] = [{ id: 'open', label: 'Open' }, { id: 'decided', label: 'Decided' }, { id: 'all', label: 'All' }];

// A surprise case hides its type until it is decided (ARCHITECTURE.md §6).
export const caseTitle = (v: CaseView, decided = false): string =>
  v.forged.surprise && !decided ? 'Unknown case' : `“Only ${pct(v.stats.rate30d)}”`;

const SEVERITY_ORDER: SeverityLevel[] = ['critical', 'high', 'medium'];

export function topSeverity(v: CaseView, cs: CaseState): SeverityLevel | null {
  if (cs.decidedAt) return 'decided';
  const live = v.flags.filter(f => f.state !== 'dismissed');
  return SEVERITY_ORDER.find(level => live.some(f => f.severity === level)) ?? null;
}

const inFilter = (f: Filter, cs: CaseState): boolean => f === 'all' || (f === 'decided') === (cs.decidedAt !== null);

export function CaseList() {
  const { state, dispatch } = useApp();
  const [filter, setFilter] = useState<Filter>('open');
  const active = activeOf(state);
  const rows = state.cases
    .map((cs, i) => ({ cs, i, view: deriveCase(cs, RULES_V1) }))
    .sort((a, b) => b.cs.openedAt.localeCompare(a.cs.openedAt) || a.i - b.i);
  const q = state.search.trim().toLowerCase();
  const code = normalizeCode(q);
  const shown = rows.filter(({ cs, view }) =>
    inFilter(filter, cs) &&
    (q === '' || view.forged.displayId.toLowerCase().includes(q) || view.forged.subject.name.toLowerCase().includes(q) || normalizeCode(cs.code).includes(code)));
  return (
    <>
      <div className="rail-head"><span className="label">Cases</span><Button variant="primary" small icon="plus" onClick={() => dispatch({ type: 'forge-open', open: true })}>New case</Button></div>
      <div className="chips">
        {FILTERS.map(f => (
          <button key={f.id} className={`chip${f.id === filter ? ' on' : ''}`} aria-pressed={f.id === filter} onClick={() => setFilter(f.id)}>
            {f.label} {rows.filter(r => inFilter(f.id, r.cs)).length}
          </button>
        ))}
      </div>
      {shown.map(({ cs, view }) => {
        const level = topSeverity(view, cs);
        const isActive = cs.code === active?.code;
        return (
          <button key={cs.code} className={`case${isActive ? ' active' : ''}${cs.decidedAt ? ' done' : ''}`} aria-current={isActive ? 'true' : undefined} onClick={() => { window.location.hash = caseHash(cs.code); }}>
            <div className="r1"><span className="num">{view.forged.displayId}</span>{level && <SeverityChip level={level} />}</div>
            <div className="t">{caseTitle(view, cs.decidedAt !== null)}</div>
            <div className="r3"><span>{view.forged.subject.name}</span><span className="num">{formatMoney(view.forged.trigger.heldAmount)}</span></div>
          </button>
        );
      })}
    </>
  );
}
