import { useMemo, useState } from 'react';
import { activeOf, useApp } from '../../app/AppContext';
import { caseHash } from '../../app/routes';
import { RULES_V1 } from '../../domain/ruleset';
import { buildReport } from '../../report/buildReport';
import { Button } from '../Button';
import { Paper } from './Paper';
import { ReportRail } from './ReportRail';
import { SidePanel } from './SidePanel';

import './report.css';

// The report view replaces the console's three columns; in practice mode the rules' suggestion stays out of the page until the case is decided (ARCHITECTURE.md §6).
export function ReportPage() {
  const { state, view } = useApp();
  const cs = activeOf(state);
  const [active, setActive] = useState('rep-rec');
  const hidden = cs !== null && cs.practice && cs.decidedAt === null;
  const concealed = cs !== null && view !== null && view.forged.surprise && cs.decidedAt === null;
  const report = useMemo(() => {
    if (!cs || !view || (hidden && cs.decision === null)) return null;
    const built = buildReport(view, cs, state.analyst, RULES_V1);
    const shown = concealed ? { ...built, header: { ...built.header, title: `Unknown case — ${view.forged.subject.name}` } } : built;
    return hidden ? { ...shown, recommendation: { ...shown.recommendation, override: null } } : shown;
  }, [cs, view, hidden, concealed, state.analyst]);

  if (!cs || !view || !report) {
    return (
      <div className="main rpt-blank">
        <h2>{cs ? 'Choose a decision in the console first' : 'Open a case to build its report'}</h2>
        {cs && <Button onClick={() => { window.location.hash = caseHash(cs.code); }}>Back to case</Button>}
      </div>
    );
  }

  const jump = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="main rpt">
      <ReportRail v={view} report={report} concealed={concealed} active={active} onJump={jump} />
      <main className="desk"><Paper v={view} cs={cs} report={report} hidden={hidden} /></main>
      <SidePanel v={view} cs={cs} report={report} hidden={hidden} />
    </div>
  );
}
