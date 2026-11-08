import type { CaseView } from '../../app/derive';
import { Icon } from '../Icon';
import { Segmented } from '../Segmented';
import { BrandTable } from './BrandTable';
import { KpiRow } from './KpiRow';
import { LatestDisputes } from './LatestDisputes';
import { MonthChart } from './MonthChart';
import { PlainWords } from './PlainWords';
import { ReasonsCard } from './ReasonsCard';

export type DisputesMode = 'purchase' | 'filed';

const MODES: { value: DisputesMode; label: string }[] = [
  { value: 'filed', label: 'Last 30 days' },
  { value: 'purchase', label: 'By month of purchase' },
];

interface DisputesTabProps { view: CaseView; mode: DisputesMode; onMode: (m: DisputesMode) => void; highlight: Set<string>; evidenceFor?: string }

// The Disputes data tab: plain reading, KPIs, then the evidence grid (ARCHITECTURE.md §6).
export function DisputesTab({ view, mode, onMode, highlight, evidenceFor = 'selected flag' }: DisputesTabProps) {
  return (
    <>
      <div className="c-head">
        <h2><Icon name="shield" style={{ width: 20, height: 20, color: 'var(--fg3)' }} />Disputes</h2>
        <Segmented label="How to count the dispute rate" options={MODES} value={mode} onChange={onMode} />
      </div>
      <PlainWords view={view} />
      <KpiRow view={view} highlight={highlight} />
      <div className="evgrid">
        <MonthChart view={view} mode={mode} highlight={highlight} evidenceFor={evidenceFor} />
        <BrandTable view={view} highlight={highlight} evidenceFor={evidenceFor} />
        <ReasonsCard view={view} highlight={highlight} evidenceFor={evidenceFor} />
        <LatestDisputes view={view} />
      </div>
    </>
  );
}
