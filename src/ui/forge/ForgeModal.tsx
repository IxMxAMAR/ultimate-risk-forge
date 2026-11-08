import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { activeOf, useApp } from '../../app/AppContext';
import { openingActivity } from '../../app/opening';
import { caseHash } from '../../app/routes';
import { disputeStats } from '../../checks/disputeMath';
import { runChecks } from '../../checks/flags';
import { CURRENT_GENERATOR_VERSION, CaseCodeError, decodeCaseCode, encodeCaseCode, randomSeed } from '../../domain/caseCode';
import { RULES_V1 } from '../../domain/ruleset';
import type { CaseTypeId, Difficulty, SellerSize } from '../../domain/types';
import { AVAILABLE_TYPES, forgeCase } from '../../forge/forge';
import { formatMoney } from '../../lib/money';
import { newCaseState } from '../../persist/db';
import { Button } from '../Button';
import { Icon, type IconName } from '../Icon';
import { Segmented } from '../Segmented';
import { CASE_TYPE_CARDS, FILTER_TAGS } from './caseTypeCards';

import './forge.css';

interface Settings { type: CaseTypeId; difficulty: Difficulty; size: SellerSize; seed: number }

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [{ value: 'easy', label: 'Easy' }, { value: 'normal', label: 'Normal' }, { value: 'hard', label: 'Hard' }];
const SIZE_OPTIONS: { value: SellerSize; label: string }[] = [{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }];
const SOLVE_TIME: Record<Difficulty, string> = { easy: '~6 min', normal: '~10 min', hard: '~15 min' };
// October payments per seller size in generator v1 (ARCHITECTURE.md §8).
const MONTHLY_PAYMENTS: Record<SellerSize, string> = { small: '300', medium: '2,000', large: '20,000' };
const HIDDEN = 'Hidden until you investigate';
const SURPRISE_STORY = 'Any kind of case. You find out what it is by investigating.';
const COMING_SOON = 'This kind of case is coming soon';

const isAvailable = (type: CaseTypeId): boolean => AVAILABLE_TYPES.includes(type);

// The New case dialog: pick a type, set difficulty, size and seed, preview the forged case, then open it (ARCHITECTURE.md §6).
export function ForgeModal() {
  const { state, dispatch } = useApp();
  const titleId = useId();
  const [settings, setSettings] = useState<Settings>({ type: 'hidden-by-growth', difficulty: 'normal', size: 'medium', seed: randomSeed() });
  const [text, setText] = useState(() => encodeCaseCode({ ...settings, version: CURRENT_GENERATOR_VERSION }));
  const [error, setError] = useState<string | null>(null);
  const [practice, setPractice] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const selected = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const latest = useRef({ close: () => {}, submit: () => {} });

  const code = encodeCaseCode({ ...settings, version: CURRENT_GENERATOR_VERSION });
  const surprise = settings.type === 'surprise';
  const forged = useMemo(() => (surprise ? null : forgeCase(code)), [code, surprise]);

  useEffect(() => {
    const opener = document.activeElement;
    selected.current?.focus();
    return () => { if (opener instanceof HTMLElement) opener.focus(); };
  }, []);

  const update = (next: Partial<Settings>) => {
    const merged = { ...settings, ...next, ...(next.type === 'surprise' ? { seed: randomSeed() } : {}) };
    setSettings(merged);
    setText(encodeCaseCode({ ...merged, version: CURRENT_GENERATOR_VERSION }));
    setError(null);
  };

  const onCodeChange = (value: string) => {
    setText(value);
    try {
      const spec = decodeCaseCode(value);
      if (!isAvailable(spec.type)) { setError(COMING_SOON); return; }
      setSettings({ type: spec.type, difficulty: spec.difficulty, size: spec.size, seed: spec.seed });
      setError(null);
    } catch (e) {
      if (!(e instanceof CaseCodeError)) throw e;
      setError(e.message);
    }
  };

  const close = () => {
    dispatch({ type: 'forge-open', open: false });
    if (window.location.hash === '#/forge') window.location.hash = activeOf(state) ? caseHash(activeOf(state)!.code) : '#/';
  };

  const submit = () => {
    if (error !== null) return;
    if (!state.cases.some(c => c.code === code)) {
      const now = new Date().toISOString();
      const made = forged ?? forgeCase(code);
      const flagCount = runChecks(made, disputeStats(made, RULES_V1), RULES_V1).length;
      dispatch({ type: 'add-case', state: { ...newCaseState(code, practice, now), activity: openingActivity(made, flagCount, now) } });
    }
    dispatch({ type: 'open-case', code });
    dispatch({ type: 'forge-open', open: false });
    window.location.hash = caseHash(code);
  };

  // Keys stay inside the dialog so the console shortcuts underneath don't fire; Tab wraps and Enter submits.
  useEffect(() => { latest.current = { close, submit }; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); latest.current.close(); }
      else if (e.key === 'Enter' && !(e.target instanceof Element && e.target.closest('[data-keeps-enter]'))) { e.preventDefault(); latest.current.submit(); }
      else if (e.key === 'Tab' && dialog.current) {
        const items = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]), input')];
        const edge = items[e.shiftKey ? 0 : items.length - 1];
        if (document.activeElement === edge || !dialog.current.contains(document.activeElement)) {
          e.preventDefault();
          items[e.shiftKey ? items.length - 1 : 0]?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const rows: { icon: IconName; label: string; value: string }[] = [
    { icon: 'swap', label: 'Payments', value: forged?.payments.length.toLocaleString('en-US') ?? HIDDEN },
    { icon: 'shield', label: 'Disputes', value: forged?.disputes.length.toLocaleString('en-US') ?? HIDDEN },
    { icon: 'wallet', label: 'Hold under review', value: forged ? formatMoney(forged.trigger.heldAmount) : HIDDEN },
    { icon: 'flag', label: 'Warning signs hidden', value: forged ? String(forged.groundTruth.planted.length) : HIDDEN },
    { icon: 'mask', label: 'Innocent look-alikes', value: forged ? String(forged.groundTruth.lookAlikes.length) : HIDDEN },
    { icon: 'timer', label: 'Time to solve', value: forged ? SOLVE_TIME[settings.difficulty] : HIDDEN },
  ];

  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <section ref={dialog} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="m-head">
          <span className="m-icon"><Icon name="hammer" style={{ color: '#fff', width: 20, height: 20 }} /></span>
          <div>
            <h2 id={titleId}>New case from the Forge</h2>
            <p>Pick a kind of case. The Forge makes up a seller, their money and their data, and hides the warning signs inside.</p>
          </div>
          <button className="x" aria-label="Close" data-keeps-enter onClick={close}><Icon name="x" /></button>
        </header>

        <div className="m-body">
          <div className="pane">
            <div className="step">
              <h3><span className="n">1</span>What kind of case?</h3>
              <div className="chips">
                <button className={`chip${filter === null ? ' on' : ''}`} aria-pressed={filter === null} onClick={() => setFilter(null)}>All {CASE_TYPE_CARDS.length}</button>
                {FILTER_TAGS.map(tag => (
                  <button key={tag} className={`chip${filter === tag ? ' on' : ''}`} aria-pressed={filter === tag} onClick={() => setFilter(tag)}>{tag}</button>
                ))}
              </div>
            </div>
            <div className="types">
              {CASE_TYPE_CARDS.map(card => {
                const available = isAvailable(card.type);
                const off = filter !== null && !card.tags.includes(filter);
                const on = card.type === settings.type;
                return (
                  <button
                    key={card.type}
                    ref={on ? selected : undefined}
                    className={`type${on ? ' sel' : ''}${card.special ? ' special' : ''}${available ? '' : ' soon'}${off ? ' off' : ''}`}
                    aria-pressed={on}
                    aria-disabled={available && !off ? undefined : true}
                    tabIndex={off ? -1 : undefined}
                    onClick={() => { if (available && !off) update({ type: card.type }); }}
                  >
                    <span className="tick"><Icon name="check" style={{ color: '#fff', width: 12, height: 12 }} /></span>
                    <span className="ic"><Icon name={card.icon} /></span>
                    <b>{card.title}</b>
                    <p>{card.blurb}</p>
                    <div className="tags">{card.tags.map(t => <span key={t}>{t}</span>)}{!available && <span className="soon-tag">Coming soon</span>}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pane">
            <div className="step"><h3><span className="n">2</span>How should it play?</h3></div>
            <div className="settings">
              <span className="lbl">Difficulty</span>
              <div className="ctl">
                <Segmented label="Difficulty" options={DIFFICULTY_OPTIONS} value={settings.difficulty} onChange={difficulty => update({ difficulty })} />
                <div className="help">Hard hides smaller warning signs and adds innocent look-alikes you'll need to dismiss.</div>
              </div>

              <span className="lbl">Seller size</span>
              <div className="ctl">
                <Segmented label="Seller size" options={SIZE_OPTIONS} value={settings.size} onChange={size => update({ size })} />
                <div className="help">{SIZE_OPTIONS.find(o => o.value === settings.size)!.label} is about {MONTHLY_PAYMENTS[settings.size]} payments a month.</div>
              </div>

              <span className="lbl">Case code</span>
              <div className="ctl">
                <div className="code">
                  <input value={text} aria-label="Case code" spellCheck={false} aria-invalid={error !== null} aria-describedby={error === null ? undefined : `${titleId}-err`} onChange={e => onCodeChange(e.target.value)} />
                  <button className="ibtn" aria-label="New random code" data-keeps-enter onClick={() => update({ seed: randomSeed() })}><Icon name="dice" /></button>
                  <button className="ibtn" aria-label="Copy code" disabled={error !== null} data-keeps-enter onClick={() => { void navigator.clipboard?.writeText(code); }}><Icon name="copy" /></button>
                </div>
                {error === null
                  ? <div className="help">Same code, same case. Share it so someone else can practise the exact same case.</div>
                  : <div className="help err" id={`${titleId}-err`} role="alert">{error}</div>}
              </div>

              <span className="lbl" id={`${titleId}-practice`}>Practice mode</span>
              <div className="ctl">
                <button className="toggle" role="switch" aria-checked={practice} aria-labelledby={`${titleId}-practice`} onClick={() => setPractice(!practice)}>
                  <span className="track" aria-hidden="true" /><span>{practice ? 'On' : 'Off'}</span>
                </button>
                <div className="help">The right answer stays hidden until you decide. Then you see your score and what you missed.</div>
              </div>
            </div>

            <div className="preview">
              <div className="label">What you'll get</div>
              {rows.map(r => (
                <div className="prow" key={r.label}><Icon name={r.icon} /><span>{r.label}</span><span className="num">{r.value}</span></div>
              ))}
              <div className="story">{forged ? <><b>The setup:</b> {forged.story}</> : SURPRISE_STORY}</div>
            </div>
          </div>
        </div>

        <footer className="m-foot">
          <span className="note"><Icon name="lock" style={{ width: 14, height: 14 }} />Everything is made up and stays on this computer.</span>
          <span className="spacer" />
          <Button data-keeps-enter onClick={close}>Cancel</Button>
          <Button variant="primary" icon="hammer" disabled={error !== null} onClick={submit}>Forge case <span className="kbd">Enter</span></Button>
        </footer>
      </section>
    </div>
  );
}
