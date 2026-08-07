# Econovaria Beta Roadmap Scope Intake Amendment — Open-World Economic RPG

**Amendment ID:** `ECON-BETA-SCOPE-OWRPG-2026-08-07`  
**Parent roadmap:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`  
**Detailed plan:** `docs/roadmaps/econovaria-open-world-economic-rpg-north-star-v1.md`  
**Roadmap item:** `GAME-DESIGN-OWRPG-001`  
**Status:** `PLANNED`  
**Audited main:** `4c17b942fcf4b2a6f60b629549f192d066053ba4`  
**Production deployment authorized:** No  
**Implementation authorized:** No — scope registration and planning only

## Scope intake

The product end goal is now explicitly:

> Build Econovaria into a persistent open-world economic RPG / immersive economic simulation in which the game creates the world, information, rules, actors, opportunities, constraints, and consequences while players choose their own goals and create their own stories through economic decisions.

This changes the long-term gameplay composition, not the current source-of-truth rules.

The target experience is **opportunity-driven rather than quest-driven**. Contracts remain useful but become optional economic/institutional opportunities rather than the universal primary loop. Existing Market, Banking, Loans, Business, Store, Inventory, Crafting, Marketplace, Messages, Progression, World, Travel, Residency, News, and Story systems remain important and should be connected into one consequence model instead of replaced.

## Beta impact

Classification: **product north star; not an automatic blocker for the current beta convergence queue.**

Current beta/runtime work should continue, especially:

- Checking/Savings convergence;
- canonical economic asset ownership;
- simulation-time authority;
- migration/runtime convergence;
- Player performance and request-path reliability;
- Admin UI V2 supervision/migration;
- release attestation and security cleanup.

These are prerequisites or enabling foundations for the open-world design.

No active Admin V2 branch, PR #501, PR #503, release branch, migration, database, Player runtime, or production deployment is modified by this planning tranche.

## Required future capability groups

The detailed north-star roadmap defines the following planned sub-items:

- `GAME-DESIGN-OWRPG-SLICE-001` — open-world vertical-slice specification;
- `GAME-DESIGN-OWRPG-DECISIONS-001` — player decision and delayed-consequence runtime;
- `GAME-DESIGN-OWRPG-OPPORTUNITY-001` — opportunity-driven Player command center;
- `GAME-DESIGN-OWRPG-PERSONAL-001` — personal economy and recurring obligations;
- `GAME-DESIGN-OWRPG-RELATIONSHIPS-001` — NPC/institution relationship memory;
- `GAME-DESIGN-OWRPG-DEPENDENCY-001` — dynamic cross-system resource dependency;
- `GAME-DESIGN-OWRPG-ACCESS-001` — progression/access/eligibility graph;
- `GAME-DESIGN-OWRPG-NARRATIVE-001` — decision-capable narrative orchestration;
- `GAME-DESIGN-OWRPG-AGREEMENTS-001` — authoritative player agreements/commitments.

## Product constraints

Future implementation must preserve:

- one authoritative owner per economic domain;
- server-derived game/player scope;
- no private ownership UUIDs in browser contracts;
- transactional and idempotent economic writes;
- Checking + Savings personal-account semantics;
- canonical Store → Inventory → Crafting → Marketplace → Business item identity;
- authoritative wall-clock simulation;
- recoverable player failure;
- no universal morality meter;
- no guaranteed-return progression bonuses;
- no requirement for the teacher to manually operate routine economic outcomes in the standard open-world profile.

## First implementation gate

Do not begin broad open-world implementation by adding more standalone feature pages.

The first implementation-oriented deliverable should be `GAME-DESIGN-OWRPG-SLICE-001`: a bounded 4–6 week vertical-slice specification proving that the existing systems plus the minimum connective mechanics can produce materially different player stories from the same world.

The slice must define:

- starting player state;
- optional livelihood/economic paths;
- personal obligations;
- information available to players;
- a shared economic opportunity;
- a supply/information shock;
- at least one multi-option institutional decision;
- immediate and delayed consequences;
- player-to-player dependency;
- at least one serious but recoverable failure path;
- teacher/Admin role;
- deterministic simulation and playtest evidence.

## Roadmap reconciliation rule

At the next edit of `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`, reconcile this amendment into that document's **Scope Intake** section and retain this file as provenance.

No item in this amendment may be marked `VERIFIED_COMPLETE` until the normal repository rules are met: merged `main`, required tests, and required staging/runtime evidence.
