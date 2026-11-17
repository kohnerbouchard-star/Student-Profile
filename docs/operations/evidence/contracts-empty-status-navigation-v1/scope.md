# Contracts explicit empty-status navigation

Item: CONTRACTS-STATUS-NAVIGATION-001. Baseline main: 03adc6891995fe1d780fe34629b1daf14470ea39.
Status: IMPLEMENTED_NOT_MERGED; local only. No database, RPC, migration or API changes.

## Reproduced issue and correction

The page used the presence of matching records to choose the selected status. Clicking a valid zero-count tab silently fell back to a populated status. A refresh removing the last matching record also moved the user into an unrelated status.

Use membership in the server-derived read model's supported tabs to honor explicit selection. Unset, invalid or removed selections still use the existing populated fallback. Empty selection does not retain another status's detail or action controls. Native buttons expose aria-pressed for the active filter; no tab role is introduced without arrow-key behavior.

## Qualification

Focused Contracts flow (including new empty-filter, refresh, stale selection, deterministic repeat and no-mutation assertions), reviewed submission history and Story decision tests pass on Node22.23.1. Player syntax check passes all 274 modules. App initial selection is unset, preserving the first populated status on initial load; explicit empty Active remains selectable. An independent review caught the former implicit Active default and this regression was corrected with coverage reading the actual initializer. Browser regression uses the production click handler and covers empty filters, keyboard return and refresh; execution blocked before launch by missing Chromium and failed official browser download. Root aggregate initially failed because shallow checkout lacked immutable predecessor e71a92a2; fetched exact object and the prior aggregate passed; final corrected-source aggregate passed. Backend typecheck is blocked at Edge checks by missing Deno; backend smoke is blocked by the same missing Deno executable, with no backend changes in this scope. No live/database qualification claimed.

Next: finish aggregate/browser checks, independent review, then exact-head hosted qualification and serial integration. Only merged and qualified release evidence can close the roadmap item.

Independent corrected-source review found no further blocking issue and independently passed Contracts tests plus 102 interaction/lifecycle characterization cases. Root aggregate uses Node22.23.1 with available npm11.9.0, not the pinned npm10.9.8; hosted pinned-toolchain qualification remains required.
