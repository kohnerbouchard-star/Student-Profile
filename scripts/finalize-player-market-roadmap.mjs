import { readFileSync, rmSync, writeFileSync } from "node:fs";

const roadmapPath = "docs/roadmaps/econovaria-beta-completion-roadmap-v1.md";
const scriptPath = "scripts/finalize-player-market-roadmap.mjs";
let roadmap = readFileSync(roadmapPath, "utf8");

function replaceOnce(before, after) {
  const count = roadmap.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`Expected exactly one roadmap occurrence, found ${count}: ${before.slice(0, 180)}`);
  }
  roadmap = roadmap.replace(before, after);
}

const replacements = [
  [
    "| Player market orders and Portfolio | `IN_PROGRESS` | PR #245, branch `agent/player-market-reconciliation-v1`; sole authority for `BETA-MKT-003` through `BETA-MKT-007` |",
    "| Player market orders and Portfolio | `VERIFIED_COMPLETE` at the repository-integrated boundary | PR #245; `BETA-MKT-003` through `BETA-MKT-007` complete with ticker-only orders, session-derived Portfolio scope, central rate limiting, and safe tick triggering |",
  ],
  [
    "| Player Dashboard and Profile runtime | `VERIFIED_COMPLETE` at the repository-integrated boundary | PR #254 merged as `1156cf11cb9c4ecd9626779d3cab15fc40940315`; evidence PR #257 merged as `9918fb33c71d59f2247da8c2af7574076beecf62`; aggregate `BETA-PLAYER-008` remains open for Portfolio |",
    "| Player Dashboard and Profile runtime | `VERIFIED_COMPLETE` at the repository-integrated boundary | PR #254 merged as `1156cf11cb9c4ecd9626779d3cab15fc40940315`; evidence PR #257 merged as `9918fb33c71d59f2247da8c2af7574076beecf62`; aggregate `BETA-PLAYER-008` completed with Portfolio on PR #245 |",
  ],
  [
    "- The merged Player capability manifest is schema `1`, version `2026-07-20.1`. Dashboard and Profile are authoritative through PR #254; Portfolio, market orders, Crafting, Loans, Business, Marketplace writes, Messages, and Progression remain unadvertised or unavailable.",
    "- The merged Player capability manifest is schema `1`, version `2026-07-20.2`. Dashboard and Profile are authoritative through PR #254; Portfolio and ticker-only market orders are authoritative through PR #245; Crafting, Loans, Business, Marketplace writes, Messages, and Progression remain unadvertised or unavailable.",
  ],
  ["| Beta capability items | 57 | 39 | 96 |", "| Beta capability items | 64 | 32 | 96 |"],
  ["| **Total identified items** | **69** | **169** | **238** |", "| **Total identified items** | **76** | **162** | **238** |"],
  [
    "- **Phase 2 — Player connection:** mostly complete; Dashboard and Profile are repository-integrated through PR #254, while Portfolio, market orders, and isolated-staging bootstrap remain open.",
    "- **Phase 2 — Player connection:** repository-integrated beta reads and writes are complete through PRs #254 and #245; isolated-staging connected bootstrap, retry, and network evidence remain open.",
  ],
  [
    "- **Phase 3 — Beta gameplay gaps:** Contracts, Store/Inventory, notifications, game lifecycle, and the repository Player recovery tranche are integrated; onboarding, cutscenes, market trade/portfolio, connected recovery evidence, and a runtime story chain remain open.",
    "- **Phase 3 — Beta gameplay gaps:** Contracts, Store/Inventory, notifications, market trade/Portfolio, game lifecycle, and the repository Player recovery tranche are integrated; onboarding, cutscenes, connected recovery evidence, and a runtime story chain remain open.",
  ],
  [
    "2. Complete `BETA-MKT-003` through `BETA-MKT-007` so market orders and Portfolio can join the authoritative Player loop.\n3. Complete onboarding and cutscene/purpose-built story delivery, then capture connected isolated-staging recovery evidence.\n4. Synchronize PR #163 with current `main`, preserve its sole ownership, close its failed calibration/map/import/rollback gates, and load only a bounded staging subset.\n5. Run the complete Phase 6 sequence, including backup/restore, retry/idempotency, lifecycle pause/end, and cross-game denial.",
    "2. Complete onboarding and cutscene/purpose-built story delivery, then capture connected isolated-staging recovery evidence.\n3. Synchronize PR #163 with current `main`, preserve its sole ownership, close its failed calibration/map/import/rollback gates, and load only a bounded staging subset.\n4. Run the complete Phase 6 sequence, including backup/restore, retry/idempotency, lifecycle pause/end, and cross-game denial.",
  ],
  [
    "- [x] `BETA-CAP-002` Version the manifest schema and capability mapping independently. `VERIFIED_COMPLETE`; current schema is `1` and current manifest is `2026-07-19.4`.",
    "- [x] `BETA-CAP-002` Version the manifest schema and capability mapping independently. `VERIFIED_COMPLETE`; current schema is `1` and current manifest is `2026-07-20.2`.",
  ],
  [
    "- [x] `BETA-CAP-003` Advertise only reviewed, implemented Backend operations and represent unsupported operations as unavailable. `VERIFIED_COMPLETE`; the reviewed endpoint registry drives route/action flags and market orders, Portfolio, Dashboard, and Profile remain false or absent.",
    "- [x] `BETA-CAP-003` Advertise only reviewed, implemented Backend operations and represent unsupported operations as unavailable. `VERIFIED_COMPLETE`; manifest `2026-07-20.2` advertises reviewed Dashboard, Profile/bootstrap, market reads, watchlist, Portfolio, and ticker-only market orders while unsupported capabilities remain false or absent.",
  ],
  [
    "- [x] `BETA-CAP-006` Reconcile the manifest after every later Backend tranche and before runtime adapter execution. `VERIFIED_COMPLETE`; current manifest `2026-07-19.4` includes only the merged reviewed endpoint set.",
    "- [x] `BETA-CAP-006` Reconcile the manifest after every later Backend tranche and before runtime adapter execution. `VERIFIED_COMPLETE`; current manifest `2026-07-20.2` includes only the merged reviewed endpoint set.",
  ],
  [
    "**Overall status:** `VERIFIED_COMPLETE` for the Backend market engine and authenticated market reads/watchlist; connected Player market orders, Portfolio, scheduled staging ticks, and broader financial instruments remain `IN_PROGRESS` or `PLANNED`.",
    "**Overall status:** `VERIFIED_COMPLETE` for the Backend market engine, authenticated market reads/watchlist, connected Player Portfolio and ticker-only market orders, and the repository-controlled safe tick trigger. Isolated-staging scheduler activation, active-instrument calibration, and broader financial instruments remain `IN_PROGRESS` or `PLANNED`.",
  ],
  [
    "- [x] `BETA-MKT-002` Merge watchlist list/add/remove. `VERIFIED_COMPLETE` through PR #158; current manifest `2026-07-19.4` advertises the reviewed GET/PUT/DELETE watchlist operations.",
    "- [x] `BETA-MKT-002` Merge watchlist list/add/remove. `VERIFIED_COMPLETE` through PR #158; current manifest `2026-07-20.2` advertises the reviewed GET/PUT/DELETE watchlist operations.",
  ],
  [
    "- [ ] `BETA-MKT-003` Resolve public ticker to internal runtime asset at the order boundary.",
    "- [x] `BETA-MKT-003` Resolve public ticker to internal runtime asset at the order boundary. `VERIFIED_COMPLETE` through PR #245: `POST /players/me/stocks/orders` accepts a bounded public ticker and reviewed expected price, derives game/player/session scope from the authenticated session, resolves the active internal asset only inside the trusted Backend boundary, and rejects private-scope or stock-UUID injection.",
  ],
  [
    "- [ ] `BETA-MKT-004` Publish capability manifest for market reads, watchlist, and market orders. `IN_PROGRESS`: manifest `2026-07-19.4` truthfully advertises market reads, asset detail, and watchlist; `marketOrder` remains false until the public-ticker order boundary is reconciled under `BETA-MKT-003`.",
    "- [x] `BETA-MKT-004` Publish capability manifest for market reads, watchlist, and market orders. `VERIFIED_COMPLETE` through PR #245; manifest `2026-07-20.2` advertises market reads, asset detail, watchlist, Portfolio, and the reviewed ticker-only `marketOrder` operation, and Player preflight fails closed on coverage mismatch.",
  ],
  [
    "- [ ] `BETA-MKT-005` Connect Player Terminal to authoritative market and portfolio routes. `IN_PROGRESS`: market reads, asset detail, and watchlist are connected; Portfolio and market-order execution are not advertised by the current manifest.",
    "- [x] `BETA-MKT-005` Connect Player Terminal to authoritative market and portfolio routes. `VERIFIED_COMPLETE` through PR #245: Portfolio scope is session-derived with no ownership UUID query parameters, market orders submit ticker/expected price/side/quantity/idempotency only, and the reviewed confirmation, receipt, refresh, and limit-order-unavailable states remain intact.",
  ],
  [
    "- [ ] `BETA-MKT-006` Schedule or safely trigger market ticks in staging and beta.",
    "- [x] `BETA-MKT-006` Schedule or safely trigger market ticks in staging and beta. `VERIFIED_COMPLETE` at the repository-controlled trigger boundary through PR #245: `scripts/trigger-stock-market-tick.mjs` is game-scoped, secret-protected, HTTPS-enforcing outside localhost, timeout-bounded, deterministic when explicit tick index/seed are supplied, and emits bounded machine-readable evidence. Connected scheduler activation remains a Phase 5 environment task.",
  ],
  [
    "- [ ] `BETA-MKT-007` Verify market closed, paused, stale price, insufficient funds, insufficient shares, duplicate order, and refresh-failure states.",
    "- [x] `BETA-MKT-007` Verify market closed, paused, stale price, insufficient funds, insufficient shares, duplicate order, and refresh-failure states. `VERIFIED_COMPLETE` through PR #245 with Backend public-boundary and repository/RPC coverage, central sensitive-write rate limiting, ticker/UUID privacy checks, replay-safe idempotency, Player committed-success refresh handling, and safe-trigger closed-market/duplicate-tick evidence.",
  ],
  [
    "**Overall status:** `VERIFIED_COMPLETE` for the hardened frontend, authoritative runtime adapter, capability preflight, and manifest-advertised routes; full beta read/write coverage and isolated-staging bootstrap remain `IN_PROGRESS`.",
    "**Overall status:** `VERIFIED_COMPLETE` for the hardened frontend, authoritative runtime adapter, capability preflight, and repository-integrated beta reads/writes; isolated-staging connected bootstrap remains `IN_PROGRESS`.",
  ],
  [
    "- [x] `BETA-PLAYER-004` Consume authoritative capability manifest and version. `VERIFIED_COMPLETE`; startup consumes schema `1`, manifest `2026-07-20.1` after PR #254 merged as `1156cf11cb9c4ecd9626779d3cab15fc40940315`.",
    "- [x] `BETA-PLAYER-004` Consume authoritative capability manifest and version. `VERIFIED_COMPLETE`; startup consumes schema `1`, manifest `2026-07-20.2` after Dashboard/Profile PR #254 and market/Portfolio PR #245.",
  ],
  [
    "- [ ] `BETA-PLAYER-008` Connect Dashboard, World, News, Market, Portfolio, Store, Contracts, Inventory, Banking, Notifications, and Profile. `IN_PROGRESS`: Dashboard and Profile are authoritative through PR #254 and manifest `2026-07-20.1`; all named reads except Portfolio are connected. Portfolio remains active on PR #245, so the aggregate item stays open.",
    "- [x] `BETA-PLAYER-008` Connect Dashboard, World, News, Market, Portfolio, Store, Contracts, Inventory, Banking, Notifications, and Profile. `VERIFIED_COMPLETE` at the repository-integrated boundary through Dashboard/Profile PR #254 and market/Portfolio PR #245; manifest `2026-07-20.2` and the reviewed adapter cover every listed beta read surface without preview fallback.",
  ],
  [
    "- [ ] `BETA-PLAYER-009` Connect Store, Contract, Market, watchlist, notification, redemption, and logout writes. `IN_PROGRESS`: Store, Contract, watchlist, notification-read, redemption, and logout writes are connected; `marketOrder` remains unavailable.",
    "- [x] `BETA-PLAYER-009` Connect Store, Contract, Market, watchlist, notification, redemption, and logout writes. `VERIFIED_COMPLETE` at the repository-integrated boundary through PR #245; the ticker-only market-order write joins the previously connected Store, Contract, watchlist, notification-read, redemption, and logout operations.",
  ],
  [
    "- [ ] `BETA-PLAYER-013` Verify committed-success behavior for every economic write. `IN_PROGRESS`: Store, Contract, and Inventory redemption committed-success paths are covered; market-order execution and isolated-staging ambiguity evidence remain open.",
    "- [ ] `BETA-PLAYER-013` Verify committed-success behavior for every economic write. `IN_PROGRESS`: Store, Contract, Inventory redemption, and market-order committed-success paths are covered at the repository-integrated boundary; isolated-staging ambiguous-write evidence remains open.",
  ],
  [
    "| Player market orders and Portfolio | PR #245 / `agent/player-market-reconciliation-v1` | `IN_PROGRESS` | Sole authority for `BETA-MKT-003` through `BETA-MKT-007`; do not create another market reconciliation branch. |",
    "| Player market orders and Portfolio | PR #245 / `agent/player-market-reconciliation-v1` | `VERIFIED_COMPLETE` at repository-integrated boundary | `BETA-MKT-003` through `BETA-MKT-007` are complete; preserve the ticker-only, session-derived, rate-limited public boundary and keep active-market selection under PR #163. |",
  ],
  [
    "**Exit gate:** Met. PR #158 is merged, donor work is no longer required for Backend authority, and the current implemented endpoint set is represented by capability manifest `2026-07-20.1`.",
    "**Exit gate:** Met. PR #158 is merged, donor work is no longer required for Backend authority, and the current implemented endpoint set is represented by capability manifest `2026-07-20.2`.",
  ],
  [
    "- [ ] Connect all beta reads. `IN_PROGRESS`: Dashboard and Profile are authoritative through PR #254 and manifest `2026-07-20.1`; Portfolio remains active on PR #245.",
    "- [x] Connect all beta reads. `VERIFIED_COMPLETE` at the repository-integrated boundary through manifest `2026-07-20.2`, including Dashboard, Profile/bootstrap, and Portfolio.",
  ],
  [
    "- [ ] Connect all beta writes. `IN_PROGRESS`: market-order execution is not advertised; reviewed Store, Contract, watchlist, notification, redemption, and logout writes are connected.",
    "- [x] Connect all beta writes. `VERIFIED_COMPLETE` at the repository-integrated boundary through PR #245; market orders are reviewed, ticker-only, capability-advertised, and connected alongside Store, Contract, watchlist, notification, redemption, and logout writes.",
  ],
  [
    "**Exit gate:** Open. A real authenticated Player must still complete the full base loop in isolated staging without preview data, including the currently unavailable market-order and remaining read surfaces.",
    "**Exit gate:** Open only at the environment boundary. Repository-integrated beta reads and writes are complete; a real authenticated Player must still complete the full base loop in isolated staging without preview data, with connected retry, rate-limit, and network evidence.",
  ],
  [
    "- [ ] One complete Market trade/portfolio chain.",
    "- [x] One complete Market trade/portfolio chain. `VERIFIED_COMPLETE` at the repository-integrated boundary through PR #245 with ticker-only buy/sell execution, ledger/holding settlement, Portfolio refresh, replay safety, negative states, and committed-success refresh handling.",
  ],
];

for (const [before, after] of replacements) replaceOnce(before, after);

const releaseMarker = "### Current release condition\n";
const completionSection = `### 2026-07-20 Player market reconciliation\n\n- PR #245 completed the bounded Stock Market active-reconciliation tranche \`BETA-MKT-003\` through \`BETA-MKT-007\` without taking ownership from PR #163.\n- The public market-order boundary is ticker-only, session-derived, centrally rate-limited, stale-price protected, idempotent, and UUID-private; Portfolio reads are session-derived and browser-safe.\n- Capability manifest \`2026-07-20.2\` publishes Dashboard/Profile, Portfolio, and market orders only after exact Backend-to-adapter coverage validation.\n- The repository-controlled stock-tick trigger is secret-protected, timeout-bounded, game-scoped, deterministic when requested, and covered for closed-market and duplicate-tick rejection.\n- Active-instrument selection and calibration remain open under \`BETA-MKT-008\` and PR #163; isolated-staging scheduler activation remains an environment/release task.\n\n`;
if (!roadmap.includes("### 2026-07-20 Player market reconciliation")) {
  replaceOnce(releaseMarker, completionSection + releaseMarker);
}

const ledgerMarker = "Append entries in reverse chronological order.\n\n";
const ledgerEntry = `### 2026-07-20 — Player market reconciliation on PR #245\n\n- Completed \`BETA-MKT-003\` through \`BETA-MKT-007\` with a public ticker-only order contract, session-derived Portfolio scope, central rate limiting, stale-price protection, idempotent settlement, and a repository-controlled safe tick trigger.\n- Published capability manifest \`2026-07-20.2\` and completed aggregate Player read/write items \`BETA-PLAYER-008\` and \`BETA-PLAYER-009\` at the repository-integrated boundary.\n- Preserved PR #163 as the sole active-instrument and seed-content authority; \`BETA-MKT-008\` and isolated-staging scheduler activation remain separately open.\n\n`;
if (!roadmap.includes("### 2026-07-20 — Player market reconciliation on PR #245")) {
  replaceOnce(ledgerMarker, ledgerMarker + ledgerEntry);
}

writeFileSync(roadmapPath, roadmap);
rmSync(scriptPath, { force: true });
