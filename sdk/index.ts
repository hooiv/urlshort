// @quicklink/sdk — public surface (hand-written).
//
// `src/generated.ts` is emitted by `npm run generate` from sdk/openapi.json
// (spot-checked against the real src/app/api route handlers) and holds the
// typed client, errors, and option types. `src/client.ts` adds small
// hand-written helpers. Both are re-exported here; import from the package
// root (`@quicklink/sdk`), never from `src/*` directly.
export * from './src/generated.js'
export * from './src/client.js'
