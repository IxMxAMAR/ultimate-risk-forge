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

Types live in `src/domain/types.ts` (case specs, payments, disputes, refunds, holds, flags, decisions, ground truth, forged cases). The thresholds every check uses are one frozen ruleset, `RULES_V1` in `src/domain/ruleset.ts` (network limits, Mastercard fine schedules, hold buffer and rounding, young-account and escalation cutoffs).

The forge (`src/forge`) turns a case code into a full case: `forgeCase(code)` decodes it, picks the generator and seeds it with the case seed. Available types are Hidden by growth and Surprise (Surprise draws a concrete available type from the seed XOR 0x9E3779B9 and is flagged `surprise`); other types throw "This kind of case is coming soon". The Hidden by growth generator (`generators/hiddenByGrowth.ts`) builds card payments for Jun–Oct 2026 (October volume 300 / 2,000 / 20,000 by seller size, September = October ÷ growth of 6 / 5 / 4 for easy / normal / hard, earlier months flat-ish), brand-group dispute rates tuned per difficulty on the judged months (Jun–Aug) with low so-far rates on Sep/Oct, refunds on about 0.6% of payments (never on disputed ones), a fixed hold of 22.5% of the last 30 days rounded up to $1,000, and the ground truth. Hard cases add an ad-campaign receipts document and treat the young-account flag as a look-alike. Seller names come from `names.ts`; `starters.ts` lists the three starter codes (easy, normal, hard).

## 5. Checks & rules
Deterministic checks over a case that produce severity-ranked flags with supporting evidence.

## 6. UI
Console view for working a case, a report view, and the Forge modal. Severity is always icon, word and color. Keyboard shortcuts drive flag review.

## 7. Persistence
Cases and decisions are stored locally in IndexedDB; nothing leaves the browser.

## 8. Determinism & case codes
Generators use only a seeded RNG, so a case code reproduces the same case. Generator v1 uses asOf 2026-11-08.

The RNG is mulberry32 (`src/lib/rng.ts`); its sequence is frozen for generator v1. Case codes use Crockford base32 (`src/lib/base32.ts`) with a weighted mod-31 check character; entry is normalized (uppercase, spaces and `-` stripped, I/L read as 1, O as 0). A case code (`src/domain/caseCode.ts`) is 8 characters shown as `XX-XXXX-XX`: a 35-bit value (11-bit header of version, case type, difficulty and size, XOR-masked by an RNG draw seeded from the case seed, followed by the 24-bit seed) in 7 base32 characters plus the check character. Decoding rejects wrong length, characters outside the alphabet, check-character mismatches, and codes from a newer generator version. The display id is `RF-` plus the last four digits of the seed. Money is integer cents and dates are UTC ISO strings (`src/lib/money.ts`, `src/lib/dates.ts`).

## 9. Testing & QA
`npm test` runs the full suite, `npm run typecheck` checks types, and `npm run build` produces the static bundle.
