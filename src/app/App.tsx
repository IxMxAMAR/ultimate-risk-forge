import type { Store } from '../persist/db';
import { CaseHeader } from '../ui/console/CaseHeader';
import { CaseList } from '../ui/console/CaseList';
import { DataTabs } from '../ui/console/DataTabs';
import { TopBar } from '../ui/console/TopBar';
import { IconSprite } from '../ui/Icon';
import { AppProvider } from './AppContext';

import '../ui/console/console.css';

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
          <main className="center" />
          <aside className="side" />
        </div>
      </div>
    </AppProvider>
  );
}
