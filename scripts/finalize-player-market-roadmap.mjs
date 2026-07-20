import { readFileSync, rmSync, writeFileSync } from "node:fs";

const roadmapPath = "docs/roadmaps/econovaria-beta-completion-roadmap-v1.md";
const markerPath = "docs/roadmaps/active/player-market-reconciliation-v1.md";
const workflowPath = ".github/workflows/finalize-player-market-roadmap.yml";
const scriptPath = "scripts/finalize-player-market-roadmap.mjs";

let roadmap = readFileSync(roadmapPath, "utf8");

function replaceOnce(before, after) {
  const first = roadmap.indexOf(before);
  if (first < 0) throw new Error(`Roadmap source text not found: ${before.slice(0, 120)}`);
  if (roadmap.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Roadmap source text is not unique: ${before.slice(0, 120)}`);
  }
  roadmap = `${roadmap.slice(0, first)}${after}${roadmap.slice(first + before.length)}`;
}

replaceOnce(
  "| Beta capability items | 57 | 39 | 96 |",
  "| Beta capability items | 64 | 32 | 96 |",
);
replaceOnce(
  "| **Total identified items** | **66** | **172** | **238** |",
  "| **Total identified items** | **73** | **165** | **238** |",
);
replaceOnce(
  "- **Phase 2 — Player connection:** mostly complete; Dashboard, Portfolio, Profile, market orders, and isolated-staging bootstrap remain open.",
  "- **Phase 2 — Player connection:** repository-integrated beta reads and writes are complete; isolated-staging connected bootstrap, retry, and network evidence remain open.",
);
replaceOnce(
  "- **Phase 3 — Beta gameplay gaps:** Contracts, Store/Inventory, notifications, and game lifecycle are repository-integrated; onboarding, cutscenes, Player recovery, market trade/portfolio, and a runtime story chain remain open.",
  "- **Phase 3 — Beta gameplay gaps:** Contracts, Store/Inventory, notifications, market trade/Portfolio, and game lifecycle are repository-integrated; onboarding, cutscenes, Player recovery, and a runtime story chain remain open.",
);
replaceOnce(
  "2. Complete `BETA-MKT-003` through `BETA-MKT-007` so market orders and Portfolio can join the authoritative Player loop.\n3. Complete onboarding, cutscene/purpose-built story delivery, and Player recovery states.\n4. Synchronize PR #163 with current `main`, preserve its sole ownership, close its failed calibration/map/import/rollback gates, and load only a bounded staging subset.\n5. Run the complete Phase 6 sequence, including backup/restore, retry/idempotency, lifecycle pause/end, and cross-game denial.",
  "2. Complete onboarding, cutscene/purpose-built story delivery, and Player recovery states.\n3. Synchronize PR #163 with current `main`, preserve its sole ownership, close its failed calibration/map/import/rollback gates, and load only a bounded staging subset.\n4. Run the complete Phase 6 sequence, including backup/restore, retry/idempotency, lifecycle pause/end, and cross-game denial.",
);
replaceOnce(
  "- [x] `BETA-CAP-002` Version the manifest schema and capability mapping independently. `VERIFIED_COMPLETE`; current schema is `1` and current manifest is `2026-07-19.4`.",
  "- [x] `BETA-CAP-002` Version the manifest schema and capability mapping independently. `VERIFIED_COMPLETE`; current schema is `1` and current manifest is `2026-07-20.2`.",
);
replaceOnce(
  "- [x] `BETA-CAP-003` Advertise only reviewed, implemented Backend operations and represent unsupported operations as unavailable. `VERIFIED_COMPLETE`; the reviewed endpoint registry drives route/action flags and market orders, Portfolio, Dashboard, and Profile remain false or absent.",
  "- [x] `BETA-CAP-003` Advertise only reviewed, implemented Backend operations and represent unsupported operations as unavailable. `VERIFIED_COMPLETE`; manifest `2026-07-20.2` advertises the reviewed Dashboard, Profile/bootstrap, market reads, watchlist, Portfolio, and ticker-only market-order boundaries while unsupported capabilities remain false or absent.",
);
replaceOnce(
  "- [x] `BETA-CAP-006` Reconcile the manifest after every later Backend tranche and before runtime adapter execution. `VERIFIED_COMPLETE`; current manifest `2026-07-19.4` includes only the merged reviewed endpoint set.",
  "- [x] `BETA-CAP-006` Reconcile the manifest after every later Backend tranche and before runtime adapter execution. `VERIFIED_COMPLETE`; current manifest `2026-07-20.2` includes only the merged reviewed endpoint set.",
);
replaceOnce(
  "**Overall status:** `VERIFIED_COMPLETE` for the Backend market engine and authenticated market reads/watchlist; connected Player market orders, Portfolio, scheduled staging ticks, and broader financial instruments remain `IN_PROGRESS` or `PLANNED`.",
  "**Overall status:** `VERIFIED_COMPLETE` for the Backend market engine, authenticated market reads/watchlist, connected Player Portfolio and ticker-only market orders, and the repository-controlled safe tick trigger. Isolated-staging scheduler activation, active-instrument calibration, and broader financial instruments remain `IN_PROGRESS` or `PLANNED`.",
);
replaceOnce(
  "- [x] `BETA-MKT-002` Merge watchlist list/add/remove. `VERIFIED_COMPLETE` through PR #158; current manifest `2026-07-19.4` advertises the reviewed GET/PUT/DELETE watchlist operations.",
  "- [x] `BETA-MKT-002` Merge watchlist list/add/remove. `VERIFIED_COMPLETE` through PR #158; current manifest `2026-07-20.2` advertises the reviewed GET/PUT/DELETE watchlist operations.",
);
replaceOnce(
  "- [ ] `BETA-MKT-003` Resolve public ticker to internal runtime asset at the order boundary.",
  "- [x] `BETA-MKT-003` Resolve public ticker to internal runtime asset at the order boundary. `VERIFIED_COMPLETE` through PR #245: `POST /players/me/stocks/orders` accepts a bounded public ticker and reviewed expected price, derives game/player/session scope from the authenticated session, resolves the active internal asset only inside the trusted Backend boundary, and rejects private-scope or stock-UUID injection.",
);
replaceOnce(
  "- [ ] `BETA-MKT-004` Publish capability manifest for market reads, watchlist, and market orders. `IN_PROGRESS`: manifest `2026-07-19.4` truthfully advertises market reads, asset detail, and watchlist; `marketOrder` remains false until the public-ticker order boundary is reconciled under `BETA-MKT-003`.",
  "- [x] `BETA-MKT-004` Publish capability manifest for market reads, watchlist, and market orders. `VERIFIED_COMPLETE` through PR #245; manifest `2026-07-20.2` advertises market reads, asset detail, watchlist, Portfolio, and the reviewed ticker-only `marketOrder` operation, and the Player preflight fails closed on coverage mismatch.",
);
replaceOnce(
  "- [ ] `BETA-MKT-005` Connect Player Terminal to authoritative market and portfolio routes. `IN_PROGRESS`: market reads, asset detail, and watchlist are connected; Portfolio and market-order execution are not advertised by the current manifest.",
  "- [x] `BETA-MKT-005` Connect Player Terminal to authoritative market and portfolio routes. `VERIFIED_COMPLETE` through PR #245: Portfolio scope is session-derived with no ownership UUID query parameters, market orders submit ticker/expected price/side/quantity/idempotency only, and the reviewed confirmation, receipt, refresh, and limit-order-unavailable states remain intact.",
);
replaceOnce(
  "- [ ] `BETA-MKT-006` Schedule or safely trigger market ticks in staging and beta.",
  "- [x] `BETA-MKT-006` Schedule or safely trigger market ticks in staging and beta. `VERIFIED_COMPLETE` at the repository-controlled trigger boundary through PR #245: `scripts/trigger-stock-market-tick.mjs` is game-scoped, secret-protected, HTTPS-enforcing outside localhost, timeout-bounded, deterministic when explicit tick index/seed are supplied, and emits bounded machine-readable evidence. Connected scheduler activation remains a Phase 5 environment task rather than reopening this safe-trigger item.",
);
replaceOnce(
  "- [ ] `BETA-MKT-007` Verify market closed, paused, stale price, insufficient funds, insufficient shares, duplicate order, and refresh-failure states.",
  "- [x] `BETA-MKT-007` Verify market closed, paused, stale price, insufficient funds, insufficient shares, duplicate order, and refresh-failure states. `VERIFIED_COMPLETE` through PR #245 with Backend public-boundary and repository/RPC coverage, central sensitive-write rate limiting, ticker/UUID privacy checks, replay-safe idempotency, Player committed-success refresh handling, and safe-trigger closed-market/duplicate-tick evidence.",
);
replaceOnce(
  "- [x] `BETA-PLAYER-004` Consume authoritative capability manifest and version. `VERIFIED_COMPLETE`; startup consumes schema `1`, manifest `2026-07-19.4`.",
  "- [x] `BETA-PLAYER-004` Consume authoritative capability manifest and version. `VERIFIED_COMPLETE`; startup consumes schema `1`, manifest `2026-07-20.2`.",
);
replaceOnce(
  "- [ ] `BETA-PLAYER-008` Connect Dashboard, World, News, Market, Portfolio, Store, Contracts, Inventory, Banking, Notifications, and Profile. `IN_PROGRESS`: manifest-advertised World, News, Market reads, Store, Contracts, Inventory, Banking, and Notifications are connected; Dashboard, Portfolio, and Profile are not advertised by manifest `2026-07-19.4`.",
  "- [x] `BETA-PLAYER-008` Connect Dashboard, World, News, Market, Portfolio, Store, Contracts, Inventory, Banking, Notifications, and Profile. `VERIFIED_COMPLETE` at the repository-integrated boundary through the merged Dashboard/Profile tranche and PR #245; manifest `2026-07-20.2` and the reviewed adapter cover every listed beta read surface without preview fallback.",
);
replaceOnce(
  "- [ ] `BETA-PLAYER-009` Connect Store, Contract, Market, watchlist, notification, redemption, and logout writes. `IN_PROGRESS`: Store, Contract, watchlist, notification-read, redemption, and logout writes are connected; `marketOrder` remains unavailable.",
  "- [x] `BETA-PLAYER-009` Connect Store, Contract, Market, watchlist, notification, redemption, and logout writes. `VERIFIED_COMPLETE` at the repository-integrated boundary through PR #245; the ticker-only market-order write joins the previously connected Store, Contract, watchlist, notification-read, redemption, and logout operations.",
);
replaceOnce(
  "- [ ] `BETA-PLAYER-013` Verify committed-success behavior for every economic write. `IN_PROGRESS`: Store, Contract, and Inventory redemption committed-success paths are covered; market-order execution and isolated-staging ambiguity evidence remain open.",
  "- [ ] `BETA-PLAYER-013` Verify committed-success behavior for every economic write. `IN_PROGRESS`: Store, Contract, Inventory redemption, and market-order committed-success paths are covered at the repository-integrated boundary; isolated-staging ambiguous-write evidence remains open.",
);
replaceOnce(
  "- [ ] Connect all beta reads. `IN_PROGRESS`: Dashboard, Portfolio, and Profile are not advertised by manifest `2026-07-19.4`.",
  "- [x] Connect all beta reads. `VERIFIED_COMPLETE` at the repository-integrated boundary through manifest `2026-07-20.2`, including Dashboard, Profile/bootstrap, and Portfolio.",
);
replaceOnce(
  "- [ ] Connect all beta writes. `IN_PROGRESS`: market-order execution is not advertised; reviewed Store, Contract, watchlist, notification, redemption, and logout writes are connected.",
  "- [x] Connect all beta writes. `VERIFIED_COMPLETE` at the repository-integrated boundary through PR #245; market orders are now reviewed, ticker-only, capability-advertised, and connected alongside Store, Contract, watchlist, notification, redemption, and logout writes.",
);
replaceOnce(
  "**Exit gate:** Open. A real authenticated Player must still complete the full base loop in isolated staging without preview data, including the currently unavailable market-order and remaining read surfaces.",
  "**Exit gate:** Open only at the environment boundary. Repository-integrated beta reads and writes are complete; a real authenticated Player must still complete the full base loop in isolated staging without preview data, with connected retry, rate-limit, and network evidence.",
);
replaceOnce(
  "- [ ] One complete Market trade/portfolio chain.",
  "- [x] One complete Market trade/portfolio chain. `VERIFIED_COMPLETE` at the repository-integrated boundary through PR #245 with ticker-only buy/sell execution, ledger/holding settlement, Portfolio refresh, replay safety, negative states, and committed-success refresh handling.",
);
replaceOnce(
  "| Player market orders and Portfolio | PR #245 / `agent/player-market-reconciliation-v1` | `IN_PROGRESS` | Sole surviving authority for `BETA-MKT-003` through `BETA-MKT-007`; PR #246 is a duplicate retirement target. |",
  "| Player market orders and Portfolio | PR #245 / `agent/player-market-reconciliation-v1` | `VERIFIED_COMPLETE` at repository-integrated boundary | `BETA-MKT-003` through `BETA-MKT-007` are complete; preserve the ticker-only, session-derived, rate-limited public boundary and keep active-market selection under PR #163. |",
);
replaceOnce(
  "### Current release condition",
  "### 2026-07-20 Player market reconciliation\n\n- PR #245 completed the bounded Stock Market active-reconciliation tranche `BETA-MKT-003` through `BETA-MKT-007` without taking ownership from PR #163.\n- The public market-order boundary is ticker-only, session-derived, centrally rate-limited, stale-price protected, idempotent, and UUID-private; Portfolio reads are session-derived and browser-safe.\n- Capability manifest `2026-07-20.2` publishes Dashboard/Profile, Portfolio, and market orders only after exact Backend-to-adapter coverage validation.\n- The repository-controlled stock-tick trigger is secret-protected, timeout-bounded, game-scoped, deterministic when requested, and covered for closed-market and duplicate-tick rejection.\n- Active-instrument selection and calibration remain open under `BETA-MKT-008` and PR #163; isolated-staging scheduler activation remains an environment/release task.\n\n### Current release condition",
);

writeFileSync(roadmapPath, roadmap);
for (const path of [markerPath, workflowPath, scriptPath]) {
  rmSync(path, { force: true });
}
