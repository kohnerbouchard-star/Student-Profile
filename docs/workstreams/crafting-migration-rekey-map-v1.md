# Crafting migration rekey map v1

Status: `FINAL_CONTROLLER_ASSIGNED`

PR #300 was synchronized once with Business-merged `main` at `2b073019ed36ca63cf9a9b3c7acd14569fe88116`. The pre-synchronization Crafting head was `93b344fda089777fd90083b827ed70d5284db380`.

The controller assigned the exclusive Crafting range `20260721130000–20260721139999`. The unused remainder stays reserved for forward-only Crafting corrective migrations discovered during replay or connected acceptance.

## Final ordered family

1. `20260721130000_add_crafting_item_definitions_v1.sql`
2. `20260721130100_add_crafting_recipe_definitions_v1.sql`
3. `20260721130200_add_game_physical_economy_scope_v1.sql`
4. `20260721130300_add_crafting_job_reservations_v1.sql`
5. `20260721130400_add_equipment_and_item_effect_state_v1.sql`
6. `20260721130500_add_crafting_salvage_admin_security_v1.sql`
7. `20260721131000_add_crafting_pack_import_v1.sql`
8. `20260721131200_harden_crafting_pack_import_identity_v1.sql`
9. `20260721131300_harden_crafting_pack_version_identity_v1.sql`
10. `20260721131500_add_crafting_pack_activation_v1.sql`
11. `20260721132000_add_player_crafting_read_v1.sql`
12. `20260721132500_add_player_crafting_job_start_v1.sql`
13. `20260721133000_add_player_crafting_cancel_v1.sql`
14. `20260721133500_add_player_crafting_claim_v1.sql`
15. `20260721133700_add_player_equipment_slots_v1.sql`
16. `20260721134000_add_player_item_effects_v1.sql`
17. `20260721134500_add_player_equipment_salvage_v1.sql`
18. `20260721135000_add_admin_crafting_read_v1.sql`
19. `20260721135500_add_admin_crafting_recovery_v1.sql`
20. `20260721135700_add_admin_crafting_supply_and_grants_v1.sql`

## Reservation ledger

- World: `20260721100000–20260721108000`, merged and immutable.
- Business and Banking: `20260721120000–20260721122500`, merged and immutable.
- Crafting and Items: `20260721130000–20260721139999`, assigned and active.
- Marketplace: `20260721140000–20260721149999`, reserved and held.
- Messaging: `20260721150000–20260721159999`, reserved and held.
- Progression: `20260721160000–20260721169999`, reserved and held.
- Shared convergence: `20260721170000+`, unassigned pending final audit.

## Invariants

- SQL intent and dependency order are preserved.
- No World or Business migration is renamed, rewritten, duplicated, or reordered.
- No provisional Crafting migration filename or identity remains in the effective branch.
- Shared files are reconstructed additively from Business-merged `main`.
- Production and applied staging histories are not renamed or concealed.
- PR #163 remains the sole definition and calibration authority.
