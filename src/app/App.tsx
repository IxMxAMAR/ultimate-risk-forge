import { useState } from 'react';
import type { Store } from '../persist/db';
import { CaseHeader } from '../ui/console/CaseHeader';
import { CaseList } from '../ui/console/CaseList';
import { DataTabs } from '../ui/console/DataTabs';
import { TopBar } from '../ui/console/TopBar';
import { DisputesTab, type DisputesMode } from '../ui/console/DisputesTab';
import { IconSprite } from '../ui/Icon';
import { AppProvider, useApp } from './AppContext';

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

export function App({ store }: { store?: Store }) {
  return (
    <AppProvider store={store}>
      <IconSprite />
      <div className="app">
        <TopBar />
        <CaseHeader />
        <div className="main">
          <nav className="rail" aria-label="Cases and case data">
            <CaseList />
            <DataTabs />
          </nav>
          <Center />
          <aside className="side" />
        </div>
      </div>
    </AppProvider>
  );
}
