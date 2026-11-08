import { openDB } from 'idb';
import type { ActivityEntry, Decision, Flag } from '../domain/types';
import type { Score } from '../practice/score';

export interface CaseState {
  code: string; practice: boolean; openedAt: string;
  flagStates: Record<string, { state: Flag['state']; note: string }>;
  analystFlags: Flag[];
  decision: Decision | null; overrideReason: string;
  sellerMessage: string | null; messageRead: boolean;
  secondReviewer: string;
  activity: ActivityEntry[];
  decidedAt: string | null; score: Score | null;
}
export interface Settings { analystName: string }
export interface Store {
  all(): Promise<CaseState[]>; put(s: CaseState): Promise<void>; remove(code: string): Promise<void>;
  settings(): Promise<Settings>; saveSettings(s: Settings): Promise<void>;
  persistent: boolean;
}

const DEFAULT_SETTINGS: Settings = { analystName: 'Analyst' };

export const newCaseState = (code: string, practice: boolean, now: string): CaseState => ({
  code, practice, openedAt: now, flagStates: {}, analystFlags: [], decision: null, overrideReason: '',
  sellerMessage: null, messageRead: false, secondReviewer: '', activity: [], decidedAt: null, score: null,
});

export function memoryStore(): Store {
  const cases = new Map<string, CaseState>();
  let settings = DEFAULT_SETTINGS;
  return {
    persistent: false,
    all: async () => [...cases.values()],
    put: async s => { cases.set(s.code, s); },
    remove: async code => { cases.delete(code); },
    settings: async () => settings,
    saveSettings: async s => { settings = s; },
  };
}

// See ARCHITECTURE.md §7: if IndexedDB cannot be opened the app still works, in memory only.
export async function openStore(dbName = 'risk-forge'): Promise<Store> {
  try {
    const db = await openDB(dbName, 1, {
      upgrade(d) {
        d.createObjectStore('cases', { keyPath: 'code' });
        d.createObjectStore('settings');
      },
    });
    return {
      persistent: true,
      all: () => db.getAll('cases'),
      put: async s => { await db.put('cases', s); },
      remove: code => db.delete('cases', code),
      settings: async () => (await db.get('settings', 'settings')) ?? DEFAULT_SETTINGS,
      saveSettings: async s => { await db.put('settings', s, 'settings'); },
    };
  } catch {
    return memoryStore();
  }
}
