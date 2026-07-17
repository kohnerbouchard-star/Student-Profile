# Player Backend Donor Accounting

Date: 2026-07-18
Target PR: #158
Donor PRs: #141 and #143
Policy: extract reviewed backend behavior only; never merge or restore donor trees wholesale

## PR #141 accounting

### Candidate backend behavior to reconcile

The following areas contain potentially unique backend behavior that corresponds to current Player Terminal contract gaps and should be reviewed file-by-file against current `main`:

- authenticated player request scope helper;
- country list, country detail, and world news handlers, route parsers, DTOs, repositories, and tests;
- Inventory read handler, DTOs, repository, and tests;
- player notification list/read handlers, request parser, route parser, DTOs, repository, and tests;
- player session logout handler and repository;
- stock asset/detail/history handler, route parser, contracts, repository, and tests;
- stock watchlist handler, route parser, contracts, repository, and tests;
- atomic Contract acceptance route/handler/repository behavior and transaction tests;
- forward Contract-acceptance and stock-watchlist migrations, subject to current migration-history and privilege review.

### Review-only modifications

These files may contain useful corrections but must be diffed against current `main` rather than copied:

- current Contract list/submission implementation and repository contracts;
- player ledger handler;
- shared Edge response helpers;
- `classroom-api` dispatcher;
- backend package metadata and lockfile;
- Supabase function lock/config files;
- stock service documentation.

### Explicitly excluded from donor import

- all `admin/**` changes;
- all `player-terminal/**` changes;
- root package and lockfile changes without a lease;
- GitHub workflows without a lease;
- broad repository governance files already represented on current `main`;
- historical migrations already present on current `main`;
- any donor migration version that conflicts with current forward history.

## PR #143 accounting

### Candidate backend behavior to reconcile

- authoritative player capability registry;
- capability-manifest integration into player bootstrap;
- Inventory redemption route parser and HTTP handlers;
- Inventory redemption backend tests;
- Inventory DTO extensions required for redemption status and action policy;
- Admin API backend routes and normalization for redemption review;
- forward-only Inventory redemption migration design;
- rolled-back database workflow smoke test.

### Required redesign or repair before porting

- Capability status must be generated from authoritative backend support and must not advertise frontend-only or incomplete mutations.
- Admin support must be exposed through backend contracts only; donor Admin JavaScript and CSS are excluded.
- The redemption migration must be assigned a unique version after comparing current migration history; do not reuse or renumber an applied migration.
- RPC grants, `search_path`, RLS, service-role behavior, and direct anon/authenticated denial require explicit verification.
- Player ownership and game scope must be derived from the active player session, independent of browser payloads.
- Admin review must validate staff role and game ownership and use deterministic transitions and pagination.
- Known donor TypeScript and Admin source-contract failures must not be imported.

### Explicitly excluded from donor import

- `admin/css/player-scope-readiness.css`;
- `admin/player-scope-readiness.js`;
- donor edits to `admin/index.html`;
- all donor `player-terminal/**` changes;
- workflow edits without an explicit lease;
- generic root scripts without an explicit lease.

## Planned extraction sequence

1. Diff and reconcile `playerRequestScope` first so all subsequent handlers share one identity boundary.
2. Port bounded read domains independently: World, Inventory, Notifications, stock asset/history, watchlist, logout.
3. Add the capability registry only after actual route support is known.
4. Reconcile Contract acceptance manually with current list/submission/review/reward semantics.
5. Design a fresh forward redemption migration from the donor behavior, then implement and test RPCs.
6. Add player and Admin redemption routes after database transaction semantics are green.
7. Publish consumer contracts; do not modify Admin or Player Terminal code in this PR.

## Donor closure rule

PRs #141 and #143 remain open and unmerged until every candidate backend change is classified as:

- ported;
- already present on current `main`;
- intentionally replaced by a safer design;
- intentionally unsupported;
- rejected with rationale.

Only after that accounting is complete may the donor PRs be closed.
