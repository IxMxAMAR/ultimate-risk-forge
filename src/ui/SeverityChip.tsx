import { Icon, type IconName } from './Icon';

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'decided';

const CHIP: Record<SeverityLevel, { cls: string; icon: IconName; word: string }> = {
  critical: { cls: 'crit', icon: 'oct', word: 'CRITICAL' },
  high: { cls: 'high', icon: 'tri', word: 'HIGH' },
  medium: { cls: 'med', icon: 'tri', word: 'MEDIUM' },
  decided: { cls: 'ok', icon: 'check', word: 'DECIDED' },
};

// Severity is always icon + word + color (ARCHITECTURE.md §6).
export function SeverityChip({ level }: { level: SeverityLevel }) {
  const { cls, icon, word } = CHIP[level];
  return <span className={`sev ${cls}`}><Icon name={icon} />{word}</span>;
}
