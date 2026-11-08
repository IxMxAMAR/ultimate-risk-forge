import type { Score } from '../../practice/score';

const PARTS = [
  { key: 'flags', label: 'Flags', max: 40 },
  { key: 'dismissals', label: 'Dismissals', max: 15 },
  { key: 'decision', label: 'Decision', max: 30 },
  { key: 'amounts', label: 'Amounts', max: 15 },
] as const;

// Shown in place of the checklist once a practice case is decided; the only place the rules' suggestion appears in practice mode (ARCHITECTURE.md §6).
export function PracticeResult({ score, suggested }: { score: Score; suggested: string }) {
  const missed = [...score.missed, ...score.wronglyConfirmed.map(t => `Confirmed “${t}”, which was a look-alike`)];
  return (
    <div className="panel" role="region" aria-label="Practice result">
      <span className="label">Practice result</span>
      <div className="pr-total">{score.total}<small>/100</small></div>
      <div className="pr-rows">
        {PARTS.map(p => (
          <div key={p.key} className="pr-row">
            <span>{p.label} {p.max}</span>
            <span className="pr-bar"><s style={{ width: `${score[p.key] / p.max * 100}%` }} /></span>
            <span className="num">{Math.round(score[p.key])}/{p.max}</span>
          </div>
        ))}
      </div>
      <div className="pr-miss">
        <b>What you missed</b>
        {missed.length === 0 ? <div>Nothing — clean run.</div> : <ul>{missed.map(m => <li key={m}>{m}</li>)}</ul>}
      </div>
      <div className="pr-sugg">The rules would have suggested: {suggested}</div>
    </div>
  );
}
