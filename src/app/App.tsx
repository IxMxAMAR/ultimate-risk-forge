import { useState } from 'react';
import type { Store } from '../persist/db';
import { CaseHeader } from '../ui/console/CaseHeader';
import { CaseList } from '../ui/console/CaseList';
import { DataTabs } from '../ui/console/DataTabs';
import { DecisionPanel } from '../ui/console/DecisionPanel';
import { FlagsPanel } from '../ui/console/FlagsPanel';
import { TopBar } from '../ui/console/TopBar';
import { DisputesTab, type DisputesMode } from '../ui/console/DisputesTab';
import { IconSprite } from '../ui/Icon';
import { ForgeModal } from '../ui/forge/ForgeModal';
import { ReportPage } from '../ui/report/ReportPage';
import { activeOf, AppProvider, useApp } from './AppContext';

import '../ui/console/console.css';

// The centre column; the flag selected on the right decides which evidence is highlighted (ARCHITECTURE.md §6).
function Center() {
  const { state, view } = useApp();
  const [mode, setMode] = useState<DisputesMode>('purchase');
  const flag = view?.flags.find(f => f.id === state.selectedFlagId);
  const highlight = new Set(flag?.evidence.tab === 'disputes' ? flag.evidence.ids : []);
  return (
    <main className="center">
      {view && state.tab === 'disputes' && <DisputesTab view={view} mode={mode} onMode={setMode} highlight={highlight} evidenceFor={flag?.title} />}
    </main>
  );
}

function Side() {
  const { state } = useApp();
  return (
    <aside className="side" aria-label="Flags and decision" key={state.activeCode}>
      <FlagsPanel />
      <DecisionPanel />
    </aside>
  );
}

function Page() {
  const { state, view } = useApp();
  const report = state.view === 'report';
  const unreadable = activeOf(state) !== null && view === null;
  return (
    <div className={`app${report ? ' is-report' : ''}`}>
      <TopBar />
      {report ? <ReportPage /> : unreadable ? (
        <div className="main">
          <nav className="rail" aria-label="Cases and case data"><CaseList /></nav>
          <main className="center"><p role="alert">This case can’t be read. Its code doesn’t match this version of Risk Forge.</p></main>
        </div>
      ) : (
        <>
          <CaseHeader />
          <div className="main">
            <nav className="rail" aria-label="Cases and case data">
              <CaseList />
              <DataTabs />
            </nav>
            <Center />
            <Side />
          </div>
        </>
      )}
      {state.forgeOpen && <ForgeModal />}
    </div>
  );
}

export function App({ store }: { store?: Store }) {
  return (
    <AppProvider store={store}>
      <IconSprite />
      <Page />
    </AppProvider>
  );
}
