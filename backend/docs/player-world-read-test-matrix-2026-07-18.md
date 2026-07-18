# Player World Read Verification Matrix

Date: 2026-07-18  
Pull request: #158  
Branch: `agent/player-backend-reconciliation-v2`

## Route and parser coverage

| Requirement | Coverage |
|---|---|
| Countries list direct path | `playerWorldRoutePaths.test.ts` |
| Country detail Edge Function path | `playerWorldRoutePaths.test.ts` |
| World news Edge Function path | `playerWorldRoutePaths.test.ts` |
| Spoofed prefix rejection | `playerWorldRoutePaths.test.ts` |
| Extra segment rejection | `playerWorldRoutePaths.test.ts` |
| Public country-code normalization | `playerWorldRequestParser.test.ts` |
| UUID country identifier rejection | `playerWorldRequestParser.test.ts` |
| Default and maximum news limit | `playerWorldRequestParser.test.ts` |
| Category allowlist | `playerWorldRequestParser.test.ts` |
| Stable cursor encode/decode | `playerWorldRequestParser.test.ts` |
| Unknown query rejection | `playerWorldRequestParser.test.ts` |
| Browser game-scope selection rejection | `playerWorldRequestParser.test.ts` and handler tests |

## Authentication and authorization coverage

| Requirement | Coverage |
|---|---|
| Valid active session | `playerWorldReadHttpHandler.test.ts` |
| Missing player session | `playerWorldReadHttpHandler.test.ts` and `playerRequestScope.test.ts` |
| Expired player session | `playerWorldReadHttpHandler.test.ts` and `playerRequestScope.test.ts` |
| Revoked player session | `playerWorldReadHttpHandler.test.ts` and `playerRequestScope.test.ts` |
| Inactive session/player/game | `playerRequestScope.test.ts` |
| Wrong-game scope | `playerWorldReadHttpHandler.test.ts` and `playerRequestScope.test.ts` |
| Query ownership UUID injection | `playerWorldReadHttpHandler.test.ts` and `playerRequestScope.test.ts` |
| Header ownership UUID injection | `playerWorldReadHttpHandler.test.ts` and `playerRequestScope.test.ts` |
| Body ownership UUID injection boundary | `playerRequestScope.test.ts` |

## Countries coverage

| Requirement | Coverage |
|---|---|
| Valid countries list | handler and service tests |
| Deterministic country ordering | service tests |
| Active profile filter | Supabase repository tests |
| Authenticated-game snapshot filter | Supabase repository tests |
| Latest effective snapshot selection | Supabase repository tests |
| Player assignment indicator | service and repository tests |
| Valid country detail | handler and service tests |
| Invalid country identifier | request parser tests |
| Unknown country | service tests |
| Hidden, disabled, or unavailable country | service and repository tests |
| Country from another game | service and repository tests |
| Safe flag and map metadata | Supabase repository tests |
| Browser DTO UUID privacy | handler and service tests |

## World news coverage

| Requirement | Coverage |
|---|---|
| Valid news list | handler and service tests |
| Authenticated-game filter | Supabase repository and service tests |
| Public visibility filter | Supabase repository tests |
| Active publication filter | Supabase repository tests |
| Category filter | parser and repository tests |
| Deterministic tick and public-ID ordering | service and repository tests |
| Maximum page size | request parser tests |
| Cursor page contract | parser, service, and repository tests |
| Empty news list | handler and service tests |
| Cross-game news exclusion | service tests and repository query assertions |
| Safe media | Supabase repository tests |
| Explicit timestamps | DTO mapping in service tests |
| Empty versus unavailable distinction | handler and service tests |
| Browser DTO UUID privacy | handler and service tests |

## Integration coverage

| Requirement | Coverage |
|---|---|
| Current `classroom-api` dispatcher wiring | Edge typecheck and classroom smoke import graph |
| Existing routes preserved | classroom API smoke and Edge typecheck |
| Backend TypeScript | `npm --prefix backend run typecheck` through Backend Typecheck |
| Edge Functions | `npm --prefix backend run typecheck:all` |
| Focused Deno suite | `npm --prefix backend run test:player-world` |
| Backend smoke | `npm --prefix backend run smoke` |
| Repository source checks | root `npm test` through Repository Quality |

## Deferred coverage

The World tranche intentionally contains no tests or implementation for Market assets, asset history, watchlists, Inventory, notifications, logout, capability manifest, Contract acceptance, or redemption. Those remain separate bounded tranches.
