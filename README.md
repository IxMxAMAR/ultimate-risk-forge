# Risk Forge

Risk Forge is an offline browser app for practising risk assessment on fictional seller cases: forge a case, review the evidence, flag the issues, and write the report. Everything stays on your computer. To run it, use `npm install` and then `npm run dev`.

## Scripts

- `npm run dev` starts the dev server.
- `npm test` runs the tests; `npm run typecheck` checks types; `npm run build` builds the static bundle.
- `npm run check:offline` builds and fails if the bundle refers to any remote address.
- `npm run qa:shots` builds and saves Chrome screenshots of the console, report and Forge screens into `qa-shots/` (set `CHROME_PATH` if Chrome is elsewhere).
