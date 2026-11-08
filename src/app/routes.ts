export interface Route { page: 'console' | 'report'; code: string | null; forge: boolean }

// Hash routes (ARCHITECTURE.md §6): `#/`, `#/case/<code>`, `#/case/<code>/report`, `#/forge`.
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#/, '').split('/').filter(Boolean);
  if (parts[0] === 'forge') return { page: 'console', code: null, forge: true };
  if (parts[0] === 'case' && parts[1]) return { page: parts[2] === 'report' ? 'report' : 'console', code: parts[1], forge: false };
  return { page: 'console', code: null, forge: false };
}

export const caseHash = (code: string): string => `#/case/${code}`;
