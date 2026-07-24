# Progression presentation content

This directory contains player-facing presentation metadata for the authoritative Econovaria Progression runtime.

## Authority boundary

`progression-content-source-v2.json` explains existing skills, achievements, and reputation types. It does not define or modify mechanical behavior.

Mechanical authority remains:

- `backend/supabase/migrations/20260721160000_add_progression_reputation_runtime_v1.sql`;
- the Progression domain runtime and its event-processing contracts;
- immutable Admin correction and replay-protection behavior.

The presentation layer must not change:

- skill IDs, tracks, tiers, prerequisites, costs, minimum levels, capabilities, or effect basis points;
- achievement IDs, criteria, thresholds, skill-point rewards, or reputation rewards;
- experience, level, daily-cap, replay, claim, or correction semantics;
- reputation score ranges, scopes, or privacy defaults.

## Covered records

The source catalog covers exactly:

- 12 skills across markets, enterprise, production, and diplomacy;
- 12 achievements;
- country, career, story, and relationship reputation.

Country and career reputation are public by default. Story and relationship reputation are private by default. Player privacy settings and authoritative server scope remain controlling.

## Generated output

The deterministic build writes:

- `docs/seed-content/executable/beta-pack-v1/progression-content-v2.json`;
- updated bounded counts and quality metadata in `pack-v1.json`;
- updated SHA-256 entries in `integrity-manifest-v1.json`;
- an updated downstream consumer binding.

Generated records remain inactive for production and do not authorize staging activation by themselves.

## Validation

Run:

```bash
npm run validate:progression-content
npm run validate:seed-beta-pack
npm run test:seed-beta-pack
```

The progression quality contract verifies migration identity parity, substantive player-facing text, evidence requirements, reward disclosure, anti-farming guidance, privacy defaults, generated-pack parity, and production prohibition.
