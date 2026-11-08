import type { Suggestion } from '../../checks/suggest';
import { formatDay } from '../../lib/dates';
import { comparePath, labelsOf } from '../../playbooks/engine';
import type { Answer, LookAt, PlaybookAnswers, StepView, Walk } from '../../playbooks/types';
import { Button } from '../Button';
import { Icon } from '../Icon';
import { PathRows } from '../PathRows';
import './playbook.css';

export interface PlaybookBarProps {
  title: string; walk: Walk; collapsed: boolean; readOnly: boolean; picked: string[];
  showData: boolean; expected: PlaybookAnswers | null; conclusion: Suggestion | null; compare: boolean;
  onPick(ids: string[]): void; onAnswer(stepId: string, chosen: string[]): void; onReopen(stepId: string): void;
  onLook(look: LookAt): void; onAcceptAll(): void; onUseDecision(): void; onCollapse(collapsed: boolean): void;
}

export function toggle(answers: Answer[], picked: string[], id: string): string[] {
  if (picked.includes(id)) return picked.filter(x => x !== id);
  if (answers.find(a => a.id === id)?.exclusive) return [id];
  return [...picked.filter(x => !answers.find(a => a.id === x)?.exclusive), id];
}

function Question({ sv, readOnly, showData, picked, expectedIds, onPick, onAnswer, onLook }: { sv: StepView; readOnly: boolean; showData: boolean; picked: string[]; expectedIds: string[]; onPick(ids: string[]): void; onAnswer(stepId: string, chosen: string[]): void; onLook(look: LookAt): void }) {
  const { step, answers, lookAt } = sv;
  const tag = (a: Answer) => showData && expectedIds.includes(a.id) && <span className="ptag"><Icon name="check" />Data says</span>;
  return (
    <div className="pq-row">
      <div>
        <div className="pq">{step.question}</div>
        {lookAt.length > 0 && (
          <div className="plook"><span className="lbl">Look at</span>
            {lookAt.map(l => <button key={l.label} type="button" className="chipev" onClick={() => onLook(l)}><Icon name="eye" style={{ width: 12, height: 12 }} />{l.label}</button>)}
          </div>
        )}
        <div className="pwhy"><Icon name="info" /><span>{step.why}</span></div>
      </div>
      <div>
        {answers.map((a, i) => {
          const on = picked.includes(a.id);
          return (
            <button key={a.id} type="button" className="pans" disabled={readOnly} aria-pressed={step.multi ? on : undefined} aria-keyshortcuts={i < 4 ? String(i + 1) : undefined}
              onClick={() => (step.multi ? onPick(toggle(answers, picked, a.id)) : onAnswer(step.id, [a.id]))}>
              {i < 4 && <span className="kbd" aria-hidden="true">{i + 1}</span>}
              <span><b>{step.multi && <span className={`pbox${on ? ' on' : ''}`}>{on && <Icon name="check" />}</span>}{a.label}{tag(a)}</b>{a.detail && <small>{a.detail}</small>}</span>
            </button>
          );
        })}
        {step.multi && <Button variant="primary" small disabled={readOnly || picked.length === 0} onClick={() => onAnswer(step.id, picked)}>Next</Button>}
      </div>
    </div>
  );
}

export function PlaybookBar(p: PlaybookBarProps) {
  const { walk, conclusion } = p;
  const live = walk.steps.filter(s => s.status !== 'skipped');
  const at = walk.current ? live.findIndex(s => s.step.id === walk.current!.step.id) : live.length;
  const step = Math.min(at + 1, walk.total);
  const remaining = walk.total - at;

  if (p.collapsed) {
    return (
      <section className="pbar pbar-c" aria-label="Playbook">
        <span>Playbook · Step {step} of {walk.total}: {p.title}</span>
        <span className="spacer" />
        <Button small icon="chev" onClick={() => p.onCollapse(false)}>Expand</Button>
      </section>
    );
  }

  const path = walk.steps.filter(s => s.status === 'done').map(s => `${s.step.title}: ${labelsOf(s.answers, s.chosen)}`).join(' · ');
  return (
    <section className="pbar" aria-label="Playbook">
      <div className="pbar-h">
        <b>Playbook · {p.title}</b><span>Step {step} of {walk.total}</span><span>~{Math.ceil(remaining / 2)} min</span>
        <span className="spacer" /><span className="kbd">1–4 to answer</span>
        <Button small onClick={() => p.onCollapse(true)}>Collapse</Button>
      </div>
      <ol className="steps6" style={{ gridTemplateColumns: `repeat(${walk.steps.length}, 1fr)` }}>
        {walk.steps.map(s => {
          if (s.status === 'skipped') return <li key={s.step.id} className="skip" title="skipped — not needed">{s.step.title}</li>;
          if (s.status === 'done') return <li key={s.step.id} className="done"><button type="button" disabled={p.readOnly} onClick={() => p.onReopen(s.step.id)}>{s.step.title}</button></li>;
          return <li key={s.step.id} className={s.status === 'current' ? 'cur' : undefined} aria-current={s.status === 'current' ? 'step' : undefined}>{s.step.title}</li>;
        })}
      </ol>
      {walk.steps.filter(s => s.drift).map(s => <div key={s.step.id} className="pdrift"><Icon name="tri" />{s.step.title}: changed outside the playbook</div>)}
      {walk.current && (
        <>
          <Question key={walk.current.step.id} sv={walk.current} readOnly={p.readOnly} showData={p.showData} picked={p.picked} expectedIds={p.expected?.[walk.current.step.id] ?? []} onPick={p.onPick} onAnswer={p.onAnswer} onLook={p.onLook} />
          {p.showData && <Button small icon="check" disabled={p.readOnly} onClick={p.onAcceptAll}>Accept the data's answers</Button>}
        </>
      )}
      {walk.done && conclusion && (
        <div className="pconc">
          <div><b>{conclusion.summary}</b><span>{conclusion.basis} · Review {formatDay(conclusion.reviewDate.slice(0, 10))}</span><span className="ppath">{path}</span></div>
          <Button variant="primary" small disabled={p.readOnly} onClick={p.onUseDecision}>Use this decision</Button>
        </div>
      )}
      {walk.done && !conclusion && <div className="pconc"><span>All steps answered — make your call in the decision panel.</span></div>}
      {p.compare && p.expected && <PathRows rows={comparePath(walk, p.expected)} />}
    </section>
  );
}
