# Architecture

Updated as modules land.

## 1. What it is
An offline browser app (no server, no network requests) for practising risk assessment on generated, fictional seller cases.

## 2. Stack
TypeScript, React and Vite. Vitest with Testing Library for tests. IndexedDB (via `idb`) for persistence. Fonts are bundled from `@fontsource/*`.

## 3. Layout
`src/app` holds the shell, `src/styles` the design tokens and global CSS, `src/test` the test setup. Domain, checks, UI and storage modules get their own folders under `src` as they land.

## 4. Domain core
Pure types and logic for sellers, transactions, evidence and cases. Money is integer cents; dates are UTC ISO strings.

## 5. Checks & rules
Deterministic checks over a case that produce severity-ranked flags with supporting evidence.

## 6. UI
Console view for working a case, a report view, and the Forge modal. Severity is always icon, word and color. Keyboard shortcuts drive flag review.

## 7. Persistence
Cases and decisions are stored locally in IndexedDB; nothing leaves the browser.

## 8. Determinism & case codes
Generators use only a seeded RNG, so a case code reproduces the same case. Generator v1 uses asOf 2026-11-08.

## 9. Testing & QA
`npm test` runs the full suite, `npm run typecheck` checks types, and `npm run build` produces the static bundle.
