# Recipe Graph Structural Validation v1

Status: passed structural design validation; economic simulation and runtime validation remain required  
Branch: `agent/seed-content-foundation-v1`  
Pull request: draft PR #163

## Validated scope

The recipe tranche contains:

- 60 unique recipe keys;
- 18 Tier I recipes;
- 24 Tier II recipes;
- 12 Tier III recipes;
- 6 regulated strategic-component recipes;
- 24 consumable outputs;
- 30 equipment outputs;
- 6 regulated component outputs;
- 12 approved substitution groups;
- 30 equipment maintenance and salvage records;
- 144 item-demand records;
- 60 four-preset difficulty-resolution records.

## Structural results

| Check | Result |
|---|---|
| Recipe keys unique | pass: 60 of 60 |
| Item references resolve to the 144-item catalog | pass |
| Entitlement references resolve | pass |
| All 42 materials have recipe demand | pass |
| All 30 components have recipe demand or regulated output | pass |
| All 30 equipment items have one primary recipe | pass |
| All 24 consumables have one primary recipe | pass |
| All 30 equipment items have maintenance and salvage records | pass |
| Every base item has at least one demand channel | pass |
| Every substitution group and member resolves | pass |
| Difficulty matrix covers all recipes and four presets | pass |
| `elastic_common` ingredients have base quantity at least two | pass |
| Hidden random failure recipes | pass: zero |
| Invalid recipe, output, or ownership UUID references | pass: zero authored |

## Difficulty integrity

The resolution policy keeps:

- `fixed_identity` unchanged;
- `fixed_strategic` unchanged;
- output quantity unchanged;
- equipment effect power unchanged;
- active-job snapshots immutable after acceptance.

Only explicitly authored `elastic_common` and `elastic_energy` quantities scale.

`standard` is treated as a legacy alias for `moderate`; new authored records use `moderate`.

## Substitution integrity

Substitutions:

- operate only where the recipe explicitly names a group;
- are chosen and recorded before quote acceptance;
- do not replace identity-defining components;
- use server-resolved ratios with deterministic rounding;
- may change material quantity and production duration;
- do not change output quantity or equipment effect power;
- require the strategic-material permit where a strategic substitute is used.

## Maintenance and salvage integrity

Every equipment item has:

- one operating-resource policy;
- one country-aligned repair profile;
- deterministic minor and major repair inputs;
- material recovery candidates;
- component recovery candidates;
- a destructive salvage rule;
- a salvage-kit requirement;
- an advanced-license requirement for component recovery.

The recovery candidates are maximum design candidates, not guaranteed output. The final amount is bounded by condition, difficulty, original recipe inputs, and the global recovery ceiling.

## Demand integrity

The item-demand matrix includes all 144 base definitions.

Demand channels cover:

- recipe inputs;
- crafted outputs;
- recipe entitlements;
- equipment operation;
- repair;
- substitution;
- salvage;
- equipment use;
- Marketplace and business inventory;
- Contract and institutional delivery;
- progression or institutional unlocks.

No base item is left without a stated destination.

## Not yet validated

The following remain unverified:

- numeric material prices;
- currency-conversion results;
- country starting stock;
- restock quantities;
- actual player income and acquisition time;
- recipe profitability;
- craft-and-resell arbitrage;
- salvage-and-recraft arbitrage;
- Marketplace fees;
- teacher fulfillment load;
- database schema;
- migration replay;
- API authorization;
- transaction isolation;
- idempotency;
- RLS;
- Admin UX;
- Player Terminal integration;
- staging import and rollback.

No production activation is authorized by this review.

## Required next validation

1. Reconcile the merged backend and capability baseline.
2. Implement schema and importer validation in a new post-reconciliation backend tranche.
3. Run deterministic economic simulation across all ten countries and four difficulties.
4. Verify every Store, crafting, repair, and salvage mutation in isolated Supabase staging.
5. Perform Player and Admin end-to-end testing before any production content import.
