# Business V2 Phase 5 — Equipment Capacity Scope v1

**Status:** OPEN — implementation not yet complete  
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

The current gap is not equipment content. The gap is that `equipment_instances.player_id` remains mandatory, Player equipment APIs assume a personal account, and no Business installation, finite equipment-time reservation, or production-readiness authority exists.

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
- Installation status must be explicit and bounded, such as `installed`, `offline`, `retired`.
- Capture canonical capability/tool tags at installation through references or server-derived reads, not browser-authored JSON.
- Enforce same-game, same-Business, same-account ownership.
- An instance cannot be installed by two Businesses or installed twice.
- Player-equipped state and Business-installed state are mutually exclusive.
- Installation/retirement actions are idempotent, permissioned through Business ownership, and audited.

## Required recipe equipment requirements

- Reuse `physical_economy_recipe_definitions.required_tools` as the canonical tool declaration.
- Add Business-specific operating metadata only where the canonical recipe lacks finite-capacity fields:
  - fixed equipment minutes per run;
  - equipment minutes per unit;
  - minimum installed instance count;
  - optional minimum operational capability version.
- Requirement rows must reference one canonical recipe and one normalized tool/capability key.
- No Player-authored requirement, duration, or productivity values.

## Required finite capacity and reservation authority

- Derive the operating period server-side from authoritative game/cycle state.
- Derive each instance’s capacity from trusted equipment profile/default policy.
- Select only active, installed, same-Business instances whose canonical item definition satisfies the required tool/capability key.
- Lock candidate instances and existing reservations in deterministic public-key order.
- Reserve exact minutes before a production action may claim equipment authority.
- Prevent two transactions from reserving the same remaining minutes.
- Bind reservations to the exact production run or production intent.
- Consume or release reservations exactly once.
- Preserve explicit recovery for failed/cancelled future manufacturing lifecycles.

## Condition and maintenance boundary

Current canonical runtime explicitly reports durability and repair as unsupported. Phase 5 will not invent browser-controlled wear or repair.

For this phase:

- operational state is server-owned and bounded;
- an offline/retired instance contributes zero capacity;
- no random equipment failure is introduced;
- no condition decrement, repair quote, maintenance charge, or salvage expansion is authorized unless opened as a separate reviewed checkpoint;
- existing Player maintenance/salvage compatibility behavior remains unchanged.

This satisfies the roadmap’s server-ownership requirement without enabling an uncertified durability economy.

## Required read model

Expose public-key-only Business equipment data:

- Business public key;
- equipment instance public key;
- canonical item key, name, slot, and capability/tool tags;
- installation status;
- operating-period key;
- capacity, reserved, consumed, available, and idle minutes;
- utilization basis points;
- no internal UUIDs, inventory-account IDs, trusted ownership fields, or raw server metadata.

## Concurrency and idempotency tests

Phase 5 must prove:

- a Player-owned instance cannot be installed by a Business;
- a Business-owned instance cannot remain Player-equipped;
- cross-game and cross-Business installation fails closed;
- duplicate installation replays rather than creating another row;
- one instance cannot satisfy two minimum-instance slots simultaneously when capacity is insufficient;
- two production attempts cannot reserve the same remaining equipment minutes;
- reservation replay does not consume capacity twice;
- conflicting idempotency reuse is rejected;
- release/consume recovery transitions occur once;
- an offline or retired installation contributes no capacity;
- public reads contain no internal UUIDs.

## Explicit exclusions

Phase 5 does not authorize:

- timed manufacturing jobs or a queue worker;
- client-declared production completion;
- Store seller offers or Store-listing inventory;
- automatic sales convergence;
- durability decay, random failure, maintenance pricing, or repair settlement;
- corporate equity, IPO, or Financial Market publication;
- merge, staging deployment, production deployment, secrets, or live data mutation.

## Completion evidence

Phase 5 remains **in progress** until all of the following are durable:

1. forward-only ownership/installation/requirement/reservation migration;
2. focused equipment authority and concurrency contracts;
3. database replay from zero twice and database lint;
4. backend and all Edge typechecks;
5. Business Economy, Business Banking, equipment, security, repository-quality, Player, and Chromium regressions;
6. public-key-only equipment read evidence;
7. exact implementation source SHA;
8. execution-plan and execution-log certification with remaining blockers and next authorized step.

## First authorized checkpoint

**Phase 5A — canonical Business equipment foundation is OPEN.** Implement the ownership cutover, Business installation authority, recipe equipment requirement metadata, public read contract, and deterministic reservation primitives. Do not integrate a timed manufacturing lifecycle or widen into Phase 6.
