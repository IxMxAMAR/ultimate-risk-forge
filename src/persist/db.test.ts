import { afterEach, describe, expect, it, vi } from 'vitest';
import { newCaseState, openStore } from './db';

afterEach(() => vi.unstubAllGlobals());

describe('store', () => {
  it('round-trips cases and removes them', async () => {
    const store = await openStore('t-roundtrip');
    expect(store.persistent).toBe(true);
    const cs = { ...newCaseState('PD-009R-HF', true, '2026-11-08T10:00:00.000Z'), overrideReason: 'because' };
    await store.put(cs);
    expect(await store.all()).toEqual([cs]);
    await store.remove(cs.code);
    expect(await store.all()).toEqual([]);
  });

  it('defaults and saves settings', async () => {
    const store = await openStore('t-settings');
    expect(await store.settings()).toEqual({ analystName: 'Analyst' });
    await store.saveSettings({ analystName: 'Sam' });
    expect(await store.settings()).toEqual({ analystName: 'Sam' });
  });

  it('falls back to memory when IndexedDB cannot open', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('blocked'); } });
    const store = await openStore('t-broken');
    expect(store.persistent).toBe(false);
    const cs = newCaseState('ZM-G0KH-5A', false, '2026-11-08T10:00:00.000Z');
    await store.put(cs);
    expect(await store.all()).toEqual([cs]);
    expect(await store.settings()).toEqual({ analystName: 'Analyst' });
  });
});
