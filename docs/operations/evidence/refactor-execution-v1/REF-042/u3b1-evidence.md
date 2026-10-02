# REF-042b1 — terminal publication preparation

Status: IN_PROGRESS; inactive optional preparation, REF-042 remains BLOCKED.
Base: `082b1ae8b720185b8522048ee929c22abc90cff3` (accepted registration PR826).
Scope: `player-terminal/src/app.js`, `player-terminal/tests/browser/player-route-refresh.spec.mjs`, this evidence and one exact-PR authority file; at most five paths and strictly fewer than 400 semantic lines including metadata. Optional injection only; no default activation. Coordinator/API, other participants, main.js/CSS, U1, package/workflows and CampusPay are protected.

Allowed symbols and acceptance are the b1 section of `u3-child-registration.md`: every app read/write publisher, session/logout/destroy, errors/status/capabilities/401 and deferred effects. Rollback reverts this optional preparation after retiring later dependents. Parent owns review/merge; b2 follows merged-main verification.

Pre-edit diagnostics ran on this base (exit 0): warm Inventory remains 0 versus authoritative 1; targeted candidate reaches 1 then late realtime regresses to 0. These are retained baseline defects, not passing acceptance.

Prerequisite PR825 merge `5d32be72e7e88644f3248104320725ed6aadc672`: terminal qualification 39 successful checks/seven conditional skips; 18 successful runs/one conditional skip. Full backend diagnostics: all 28 Edge roots, 1,355 Deno smoke passes/zero failures/status 0. Player and Store full Chromium each 133 passes/11 skips. Six accepted PR823/824 docs unchanged; nine U1 holds retained and contract 4/4.

Store Cutover run 36965111093 attempt 1 failed console-error enforcement: Messages GET returned 503 then 200 in the same second; local Edge diagnostics show CPU soft-limit and early termination. Backend/harness/composition unchanged, API uninjected. Artifact 11209880428 ZIP SHA256 `ed6e05fc0edbeec33906357cf59d9f5c4a51b20b6934573f20069eddc989f9b8`. One failed-job retry on unchanged SHA passed (job 110710214246); artifact 11209404050 ZIP SHA256 `2616984748e91ec89625a6f8f071c24ba3a709b6c50d971e1bbb8a8fed46f5a1`. Transient isolate availability is supported, not definitive causation. No source/assertion/timeout changes or further retries. This does not certify production.
