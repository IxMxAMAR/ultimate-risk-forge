import { useEffect, useRef } from 'react';

type Shortcut = 'j' | 'k' | 'c' | 'd' | 'e' | 'r' | 'ctrl+k';

const typing = (el: Element | null): boolean =>
  el !== null && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.closest('[contenteditable]:not([contenteditable="false"])') !== null);

// Keyboard shortcuts for flag review; keystrokes while typing in a field are left alone (ARCHITECTURE.md §6).
export function useShortcuts(handlers: Partial<Record<Shortcut, () => void>>) {
  const latest = useRef(handlers);
  useEffect(() => { latest.current = handlers; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(document.activeElement)) return;
      const key = e.key.toLowerCase();
      const combo = e.ctrlKey || e.metaKey ? (e.altKey ? '' : `ctrl+${key}`) : e.altKey ? '' : key;
      const run = latest.current[combo as Shortcut];
      if (!run) return;
      e.preventDefault();
      run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
