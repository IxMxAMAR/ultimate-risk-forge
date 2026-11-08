import { useEffect, useRef } from 'react';

type Shortcut = 'j' | 'k' | 'c' | 'd' | 'e' | 'r' | '1' | '2' | '3' | '4' | 'enter' | 'ctrl+k';

const typing = (el: Element | null): boolean =>
  el !== null && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.closest('[contenteditable]:not([contenteditable="false"])') !== null);

// Keyboard shortcuts for flag review and playbook answers (a handler returning false leaves the key to the browser); keystrokes while typing in a field are left alone, except Ctrl+K (ARCHITECTURE.md §6).
export function useShortcuts(handlers: Partial<Record<Shortcut, () => void | false>>) {
  const latest = useRef(handlers);
  useEffect(() => { latest.current = handlers; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const combo = e.ctrlKey || e.metaKey ? (e.altKey ? '' : `ctrl+${key}`) : e.altKey ? '' : key;
      if (combo !== 'ctrl+k' && typing(document.activeElement)) return;
      const run = latest.current[combo as Shortcut];
      if (!run) return;
      if (run() !== false) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
