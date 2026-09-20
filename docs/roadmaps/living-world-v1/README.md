# Econovaria Living World Roadmaps v1

Status: **PLANNED**
Baseline main: `22dc9ce5023eb200a6608d5bb90a9ac30cb36c90`
Repository: `kohnerbouchard-star/Student-Profile`

This directory is the canonical repository copy of the Living World development roadmaps prepared after the Phase 14 repository-certified checkpoint.

## Codex usage

Before implementing any item:

1. Verify live `main`; do not assume the baseline SHA is still current.
2. Read `00-MASTER-ROADMAP.md`.
3. Read `roadmap-manifest.json`.
4. Read the relevant workstream file.
5. Re-audit current code, migrations, open PRs, and ownership before editing.
6. Preserve existing canonical authorities for Banking, FX, Inventory, Store, Market, Business, Messaging, Story, Progression, and World.
7. Treat every milestone here as `PLANNED` until repository evidence proves otherwise.
8. These documents do **not** authorize production deployment, live SQL, secret changes, scheduler changes, or bypassing release gates.

## Workstreams

- `01-shared-foundation.md` — FND: ownership, time semantics, acceptance harness, cross-domain contracts.
- `02-player-life-economy.md` — LIFE: jobs, wages, bills, housing, careers, recovery.
- `03-macroeconomy-v2.md` — MAC: causal macro model, labor, inflation, trade, policy, shadow cutover.
- `04-characters-relationships-v2.md` — REL: deeper intent, memory, verified opportunities, relationship arcs.
- `05-one-year-living-world.md` — WORLD: recurring content, seasons, consequence memory, return continuity.
- `06-advanced-markets-analyst.md` — CAP: advanced orders, selected instruments, Analyst forecasts.
- `07-progression-credentials.md` — PROG: real eligibility and pathway consequences.
- `08-player-identity-ux.md` — UX: profile, notifications, action flows, accessibility, closure.
- `09-integration-certification.md` — INT: integrated pilot and final program certification.

## First integrated target

The first integrated target is `PILOT-01`: prove a complete four-week player journey before expanding all seven tracks.

## Authority note

Phase 15 live migration/release work remains separate. This roadmap must not be used as implicit authority to alter staging or production.
