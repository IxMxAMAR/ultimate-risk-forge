import type { ActivityEntry } from '../../domain/types';

const MINUTE = 60000;

// Relative time for the log, e.g. "now", "2m", "3h", "4d"; display only.
function ago(ts: string): string {
  const ms = Math.max(0, Date.now() - Date.parse(ts));
  if (ms < MINUTE) return 'now';
  if (ms < 60 * MINUTE) return `${Math.floor(ms / MINUTE)}m`;
  if (ms < 24 * 60 * MINUTE) return `${Math.floor(ms / (60 * MINUTE))}h`;
  return `${Math.floor(ms / (24 * 60 * MINUTE))}d`;
}

const dotOf = (what: string): string => (/ (confirmed|signed|marked) /.test(what) ? 'ok' : / (changed|added) /.test(what) ? 'ac' : '');

export function ActivityLog({ entries }: { entries: ActivityEntry[] }) {
  return (
    <section className="activity" aria-label="Activity log">
      <div className="label">Activity</div>
      {entries.length === 0 && <div className="act"><i /><span>No activity yet</span><time /></div>}
      {[...entries].reverse().map((e, i) => (
        <div className="act" key={`${e.ts}-${entries.length - i}`}><i className={dotOf(e.what)} /><span>{e.what}</span><time>{ago(e.ts)}</time></div>
      ))}
    </section>
  );
}
