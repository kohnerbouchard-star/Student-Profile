# Retained loan review status correction — local qualification candidate

Base: `86eae5fad58d33787b583f21da70be8c6ec50d39`.

The forward migration aliases `business_entities` and qualifies only its `status`
predicate in `review_player_loan_application_v1`. This repairs review of eligible
existing legacy applications; it does not enable new business lending or change
liability, mandates, affordability, formulas, account bindings or terminal replay.
Historical migrations and the merged password correction remain unchanged.

The proposed tenth suffix pins filename, version, order, raw/normalized SHA256 and
one-statement identity. The original nine identities and immutable bundles remain
unchanged. Existing missing/extra/order/prefix/digest rejection controls remain.

Proposed PR-only CI uses exact-head checkout, pinned tools and a disposable local
Supabase PostgreSQL stack. Attestation rejects non-PR events, overridden database
endpoints, wrong workflow/job/source, remote Docker, stale/unowned or wrong-image
containers, unexpected migration ledgers and changed database identity. Missing
DB fails rather than skipping. No hosted Auth/accounts or external DB is used.

The baseline probe temporarily installs the actual unchanged historical routine
inside a rolled-back transaction on migrated tables. Candidate acceptance checks
the effective migrated body, signature, security/ACL, exact balanced bank posting,
three expected audit records, decline, terminal replay, denials and rollback.
Two independent connections must observe real application-lock contention, then
prove one durable approval with identical/different receipt keys and other-game
snapshots unchanged. Race fixtures are synthetic and live only until stack stop.
Existing Banking FX/pre-liability upgrade acceptance and its repayment checks are
retained. No application or loan creation gate is dropped by the new tests.

Status: source/guard qualification only. Actual baseline, effective full-schema,
approval/rollback, Banking FX upgrade and concurrency execution are **NOT RUN**.
Static passes are not database proof. Original Database Replay still requires two
resets, schema/catalog determinism and lint; existing live/release holds remain.

Publication and any PR-specific exact-path authority manifest require a separate
bounded publication decision. This candidate does not authorize upload, merge,
review approval, release, deployment, hosted mutation or release-hold changes.
