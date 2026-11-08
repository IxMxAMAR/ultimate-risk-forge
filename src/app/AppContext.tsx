import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from 'react';
import { RULES_V1 } from '../domain/ruleset';
import { normalizeCode } from '../lib/base32';
import { STARTER_CODES } from '../forge/starters';
import { openStore, type CaseState, type Store } from '../persist/db';
import { deriveCase, type CaseView } from './derive';
import { starterCases } from './opening';
import { caseHash, parseRoute } from './routes';
import { reducer, type AppAction, type AppState } from './state';

interface AppContextValue { state: AppState; dispatch: Dispatch<AppAction>; view: CaseView | null }

const SAVE_DELAY_MS = 300;

const INITIAL: AppState = {
  cases: [], activeCode: null, view: 'console', tab: 'disputes', selectedFlagId: null,
  forgeOpen: false, search: '', analyst: 'Analyst', persistent: true,
};

export const activeOf = (s: AppState): CaseState | null => s.cases.find(c => c.code === s.activeCode) ?? null;

const Ctx = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp needs an AppProvider');
  return v;
}

// Loads the store, follows the URL hash and saves changed cases 300 ms after the last change (ARCHITECTURE.md §6, §7).
export function AppProvider({ store: injected, children }: { store?: Store; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const store = useRef<Store | null>(null);
  const saved = useRef(new Map<string, CaseState>());
  const dirty = useRef(new Map<string, CaseState>());
  const latest = useRef<CaseState[]>([]);
  const activeCode = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let live = true;
    const follow = (cases: CaseState[]) => {
      const route = parseRoute(window.location.hash);
      if (route.forge) dispatch({ type: 'forge-open', open: true });
      const target = route.code === null ? undefined : cases.find(c => normalizeCode(c.code) === normalizeCode(route.code!));
      if (target && target.code !== activeCode.current) dispatch({ type: 'open-case', code: target.code });
      if (target || route.code === null) dispatch({ type: 'set-view', view: route.page });
    };
    const onHash = () => follow(latest.current);
    void (async () => {
      const s = injected ?? await openStore();
      const [stored, settings] = await Promise.all([s.all(), s.settings()]);
      const firstRun = stored.length === 0;
      const cases = firstRun ? starterCases(Date.now()) : stored;
      if (firstRun) await Promise.all(cases.map(c => s.put(c)));
      if (!live) return;
      store.current = s;
      saved.current = new Map(cases.map(c => [c.code, c]));
      dispatch({ type: 'loaded', cases, analyst: settings.analystName, persistent: s.persistent });
      follow(cases);
      const named = parseRoute(window.location.hash);
      if (firstRun && !cases.some(c => named.code !== null && normalizeCode(c.code) === normalizeCode(named.code))) {
        dispatch({ type: 'open-case', code: STARTER_CODES[2] });
        if (!named.forge) window.location.hash = caseHash(STARTER_CODES[2]);
      }
    })();
    window.addEventListener('hashchange', onHash);
    return () => { live = false; window.removeEventListener('hashchange', onHash); };
  }, [injected]);

  useEffect(() => {
    latest.current = state.cases;
    activeCode.current = state.activeCode;
  }, [state.cases, state.activeCode]);

  useEffect(() => {
    if (!store.current) return;
    for (const c of state.cases) {
      if (saved.current.get(c.code) !== c) { saved.current.set(c.code, c); dirty.current.set(c.code, c); }
    }
    if (dirty.current.size === 0) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const batch = [...dirty.current.values()];
      dirty.current.clear();
      for (const c of batch) void store.current?.put(c);
    }, SAVE_DELAY_MS);
  }, [state.cases]);

  useEffect(() => () => {
    clearTimeout(timer.current);
    for (const c of dirty.current.values()) void store.current?.put(c);
    dirty.current.clear();
  }, []);

  const cs = activeOf(state);
  const view = useMemo(() => (cs ? deriveCase(cs, RULES_V1) : null), [cs]);
  const value = useMemo(() => ({ state, dispatch, view }), [state, view]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
