# REF025 disposable race phase — Child 1

APPROVED_SCOPE: user approved the disposable test method; parent controls review/merge.
Base: 7004ada7a0cd2a5138085a05ba0d0561b63d0819. Child 1: five paths, <=360 semantic changed lines.
- scripts/ref025-business-loan-concurrency.mjs
- scripts/ref025-business-loan-concurrency.test.mjs
- .github/workflows/banking-fx-clearing-v1.yml
- docs/operations/evidence/refactor-execution-v1/REF-025/u5-c2-races.md
- docs/operations/contracts/player-cross-cutting/pr-865.json (draft PR865).

Only banking-fx-clearing-v1/database-acceptance, attested exclusively disposable local database.
Reuse unchanged Store openPsqlSession; track backend PID/start, exact blocker, deadline, client/backend exit.
Child 1 keeps both gates installed; no committed business fixtures or submission calls.
Always full reset after attempted phase, then independent exact gate/migration/fixture verification.
Failures remain failures; cancellation/runner loss cannot guarantee restoration. No backend termination.
No hosted access, migrations/packages/shared helper/Player/Markets/auth changes or release-hold restoration.
PR859 remains superseded and unqualified: busy source (2 unidentified sessions), deadline/list-GUC/null-marker/cleanup gaps.
Its code is not imported. Original failure: run37255720724/job111592230701; local Docker capacity failure retained there.
PR620 overlaps only unchanged upload-artifact pins; PR863 and other open owners have no selected-path collision.
REF025 BLOCKED; REF027 depends025+026; all nine U1 holds remain. No production lending activation.
Implementation: scoped async wrapper plus harmless advisory-lock barrier and SQL-timeout probe; no fixture writes.
Local pinned Node22.23.1: focused tests and authority tests pass; scope/whitespace verification required before push.
CI must prove exact blocker PID/start, client/backend exit, full reset and independent restored gates/ledger checks.
Child1 fixture-absence checks assert zero nonlegacy applications/loans; future fixtures need their own registered checks.
No GUC copying, clone, marker-based ownership or atomic DROP claims. Existing background sessions are not terminated.
Next: exact-head Child1 qualification and parent review, then separately registered Child2; runtime evidence NOT_RUN until CI.

Independent review blocked d17d7e8: empty execFile output parsed as zero; no post-await cleanup deadline check.
Pinned Node22.23.1 reproduced resolved empty stdout after41ms with timeout5ms/blocked loop40ms; new strict parser checks deadline first.
Earlier green lifecycle/reset evidence is retained but cannot qualify the corrected head; fresh CI/review required.

## Child 2 — approved disposable submission races
Base 7268f9ccec7bf411ca359f1058ccbe7386f7e2eb: Child1 #865 merged qualified923f7a75 with identical tree; all7 main workflows passed.
User approved merge and Child2 continuation on2026-10-05; parent retains Child2 review/merge authority.
Exactly5 paths /390 semantic changed lines (additions+deletions), including this record:
scripts/ref025-business-loan-concurrency.sql (new fixture), scripts/ref025-business-loan-concurrency.mjs,
scripts/ref025-business-loan-concurrency.test.mjs, this file, and docs/operations/contracts/player-cross-cutting/pr-866.json (draft #866).
Fresh13-open-PR full-path census: no collisions, including paginated #620; #859 remains unqualified history.
Only duplicate/conflicting submission races, injected rollback and two-game isolation; existing private command unchanged.
Remove only application creation CHECK in the attested disposable Banking phase; retain validated player_loans CHECK throughout.
Use real Store sales, existing canonical authority and unchanged session helper; exact PID/start lock barrier, no sleeps as race proof.
Compare complete application/profile/audit and monetary snapshots; replay keeps original initiator/assessment; no extra loan/ledger effects.
Full database reset remains mandatory, followed by independent gate/migration and new fixture-absence checks; client/backend exit stays bounded.
No workflow/shared helper/package/migration/Player/Markets/auth edits, hosted access, dispatch or deployment. Nine U1 holds unchanged.
REF025 remains BLOCKED; REF027 depends025+026. No new liability/default/FX semantics or activation credit.
Validation: pending implementation, pinned tests, disposable Banking CI and parent review. Revert only this bounded test change.
Implementation now uses two real-sale games, exact business-row blockers, cross-operator replay/conflict and scoped audit-failure injection.
Independent game commits while the first game's transaction remains open; rollback leaves the other game's rows unchanged.
Pinned Node22.23.1:11 focused+16 authority tests PASS; boundary ratchet80 PASS. Disposable exact-head CI and parent review remain pending.
Head18ecd477 failed fixture setup before races: run37391390936/job112037043071 FX_FIXING_NOT_FOUND; reset+independent verification PASS.
Source trace: the second bootstrap sees the first synthetic country as an eleventh active snapshot; hide only fixture-owned countries during bootstrap.
Assert ready bootstrap explicitly and suppress canonical DROP IF EXISTS notices only (client_min_messages=warning); SQL errors remain fatal. Fresh CI required.
Heada4b2fc8f job112038553698 failed with Unexpected end of JSON input; full reset+independent verification again PASS.
The one-line JSON parser truncated valid multiline composite aggregates. Frame complete rows between unique markers; reject absent/duplicate/incomplete frames.
Regression reproduces truncation and checks complete multiline decoding; unchanged shared Store helper and all deadline/cleanup checks retained. Fresh CI required.
