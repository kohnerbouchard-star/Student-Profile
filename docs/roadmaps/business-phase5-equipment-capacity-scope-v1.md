# Business V2 Phase 5 — Equipment Capacity Scope v1

**Status:** COMPLETE — certified on exact implementation source `6f936abd61c6cd903f6e839790ceab24ed570748`  
**Branch:** `feat/business-equipment-capacity-v2`  
**Parent branch:** `feat/business-workforce-production-labor-v2`  
**Certified Phase 4 implementation:** `857ab6ec77bf02ad619092632e2def80f12d4329`  
**Parent durable certification head:** `213557d2028b7152562f7a23c167d9532d469203`  

## Purpose

Phase 5 connects canonical equipment identity and unique instances to Business production capacity without creating a second item catalog, recipe catalog, inventory system, or Player-loadout model.

The governing rule is:

> A Business may use only canonical equipment it owns and has installed. Equipment capacity is finite, server-derived, and cannot be double-booked.

## Audited canonical authority

The repository already contains the required definition and identity foundations:

- `physical_economy_item_definitions` is the canonical equipment-definition authority and contains equipment class, slot, effect code, and tool tags.
- `game_items` is the game-scoped canonical item identity.
- `equipment_instances` is the unique serialized-equipment identity and already references canonical inventory accounts and game items.
- `physical_economy_recipe_definitions.required_tools` is the existing canonical recipe tool/capability declaration.
- canonical `economic_parties`, `inventory_accounts`, and `inventory_holdings` own Business stock and cost basis.

The Phase 5 cutover makes `equipment_instances.player_id` nullable while retaining it as Player compatibility provenance. Business ownership is derived from the canonical Business warehouse inventory account and its economic party; no parallel Business equipment identity is introduced.

## Locked architecture decisions

- Do not create Business equipment definitions, Business equipment items, or another recipe-tool catalog.
- Preserve existing Player equipment routes and personal-slot behavior.
- Generalize equipment-instance ownership through the canonical inventory account and economic party while keeping `player_id` as nullable compatibility provenance for Player-owned instances.
- A Business equipment instance must be held by an active canonical Business inventory account and owned by the same game-scoped Business economic party.
- Installation is Business operational state, separate from ownership and separate from Player `equipped_slot` state.
- Recipe equipment requirements reference the canonical recipe and a canonical tool/capability key derived from `required_tools` and equipment definition tool tags.
- Equipment capacity is measured in server-owned minutes per authoritative operating period.
- Reservations lock one installed instance, requirement, Business, period, and production intent in deterministic order.
- Reserved, active, and consumed minutes count against period capacity; released minutes do not.
- Matching idempotency retries replay existing reservations; conflicting reuse fails closed.
- Browser payloads may select public Business/equipment keys only. They cannot submit game UUIDs, Business UUIDs, inventory accounts, capacity, condition, maintenance outcomes, or requirement totals.

## Required equipment-instance ownership cutover

- Make `equipment_instances.player_id` nullable without breaking existing Player rows or routes.
- Add/retain exact game/account/item constraints.
- Add an ownership invariant:
  - Player instance: personal account owned by the same Player party and `player_id` populated.
  - Business instance: Business-owned account and `player_id` null.
- Reject system, Store, escrow, cross-game, wrong-party, and ambiguous ownership.
- Keep unique public `eqp_...` identifiers and internal UUID privacy.
- Provide a trusted, idempotent Business instance-provisioning/transfer boundary that creates or rehomes one canonical serialized instance only when matching canonical inventory authority exists.
- Do not infer multiple equipment instances from an arbitrary stack quantity without exact instance evidence.

## Required Business installation authority

- Create one installation row per Business-owned equipment instance.
- Installation status is explicit and bounded: `installed`, `offline`, or `retired`.
- Capability/tool tags are server-derived from canonical equipment definitions and trusted capacity profiles, never browser-authored JSON.
- Same-game, same-Business, same-account ownership is enforced.
- An instance cannot be installed by two Businesses or installed twice.
- Player-equipped state and Business-installed state are mutually exclusive.
- Installation/status actions are idempotent, permissioned through Business ownership, and audited.

## Required recipe equipment requirements

- `physical_economy_recipe_definitions.required_tools` remains the canonical tool declaration.
- `business_recipe_equipment_requirements` adds only Business-specific finite-capacity metadata where the canonical recipe lacks it:
  - fixed equipment minutes per run;
  - equipment minutes per unit;
  - minimum installed instance count.
- Requirement rows reference one canonical recipe and one normalized tool/capability key.
- Future canonical recipe `required_tools`, duration, and status changes synchronize the derived Business equipment requirements automatically.
- No Player-authored requirement, duration, capability, or productivity values exist.

## Required finite capacity and reservation authority

- The operating period is derived server-side from authoritative game/cycle state.
- Each instance’s capacity is derived from trusted equipment definition/profile policy.
- Only active, installed, same-Business instances whose canonical definition satisfies the required tool/capability key are eligible.
- Candidate installations and instances are locked in deterministic public-key order.
- Exact minutes are reserved before production may claim equipment authority.
- Two transactions cannot reserve the same remaining equipment minutes.
- Reservations bind to an exact production intent and later to the committed production run.
- Successful instant production consumes reservations exactly once; matching replay does not reserve or consume again.
- Production failure rolls back the equipment reservations in the same transaction.
- Explicit release/consume recovery remains available for future manufacturing lifecycles.

## Condition and maintenance boundary

Current canonical runtime explicitly reports durability and repair as unsupported. Phase 5 does not invent browser-controlled wear or repair.

For this phase:

- operational state is server-owned and bounded;
- an offline/retired installation contributes zero capacity;
- no random equipment failure is introduced;
- no condition decrement, repair quote, maintenance charge, or salvage expansion is authorized;
- existing Player maintenance/salvage compatibility behavior remains unchanged;
- the public Business equipment read reports durability and repair as unsupported.

This satisfies the roadmap’s server-ownership requirement without enabling an uncertified durability economy.

## Required read model

The server-side Business equipment read exposes public-key-only operational data:

- Business public key;
- installation public key;
- equipment instance public key;
- canonical item key, name, slot, and capability/tool tags;
- installation status;
- operating-period key;
- capacity, reserved, consumed, available, and idle minutes;
- utilization basis points;
- durability/repair support flags;
- no internal UUIDs, inventory-account IDs, trusted ownership fields, or raw server metadata.

## Concurrency and idempotency evidence

Phase 5 proves:

- a Player-owned instance cannot be treated as a Business-owned installation;
- a Business-owned instance cannot remain Player-equipped;
- cross-game and cross-Business installation fails closed;
- duplicate installation/materialization replays instead of creating duplicate authority;
- one instance cannot satisfy two minimum-instance slots when finite capacity is insufficient;
- two production attempts cannot reserve the same remaining equipment minutes;
- reservation and production replay do not consume capacity twice;
- conflicting idempotency reuse is rejected;
- release/consume recovery transitions occur once;
- offline or retired installations contribute no capacity;
- public reads contain no internal UUIDs;
- failed production leaves no committed equipment reservation because settlement is transactional.

## Explicit exclusions

Phase 5 does not authorize:

- timed manufacturing jobs or a queue worker;
- client-declared production completion;
- Store seller offers or Store-listing inventory;
- automatic sales convergence;
- durability decay, random failure, maintenance pricing, or repair settlement;
- corporate equity, IPO, or Financial Market publication;
- merge, staging deployment, production deployment, secrets, or live data mutation.

## Certification evidence

**Exact implementation and verification source:** `6f936abd61c6cd903f6e839790ceab24ed570748`.

Required exact-head verification passed:

- **Business Equipment Capacity V2 — PASS** (`32605009671`), including foundation, deterministic capacity, canonical-recipe synchronization, production-equipment integration, Phase 4 regressions, repository suite, all backend/Edge typechecks, and retained Player Business checks.
- **Database Replay from zero twice plus rebuilt-database lint — PASS** (`32605009709`).
- **Backend Typecheck — PASS** (`32605009722`).
- **Business Banking Runtime — PASS** (`32605009647`).
- **Business Economy V2 — PASS** (`32605009635`).
- **Business Workforce Production Payroll V2 — PASS** (`32605009705`).
- **Repository Quality — PASS** (`32605009728`).
- **Supply Chain Security — PASS** (`32605009711`).
- **Player Terminal Verify, including Chromium — PASS** (`32605009756`).
- **Admin API Check — PASS** (`32605009682`).
- **Staging Readiness Preflight — PASS** (`32605009637`).
- **Required Game Market Timezone — PASS** (`32605009732`).
- **Exchange Calendar Runtime — PASS** (`32605009702`).

## Completion result

1. Forward-only ownership/installation/requirement/reservation migrations: **met**.
2. Focused equipment authority, production and concurrency contracts: **met**.
3. Database replay from zero twice and database lint: **met**.
4. Backend and all Edge typechecks: **met**.
5. Business Economy, Business Banking, equipment, security, repository-quality, Player and Chromium regressions: **met**.
6. Public-key-only equipment read evidence: **met**.
7. Exact implementation source SHA: **met**.
8. Durable execution-plan/log certification: **met by the later documentation-only certification commits; those commits do not replace the tested source above**.

## Next authorized step

**Phase 6 — timed manufacturing is OPEN after this certification.** Reuse the certified material, labor and equipment reservation authorities to replace instant physical production with a server-timed production-job lifecycle. Do not widen into Store seller offers, IPO, merge, staging, or production deployment.
