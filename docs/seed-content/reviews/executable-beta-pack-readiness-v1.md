# Executable beta seed pack readiness

## Authority and branch state

- PR authority: #163
- Branch: `agent/seed-content-foundation-v1`
- Verified repository head: `a1320658cbde6fdaefd87b0acd9d88a005f63604`
- Main ancestor verified: `906050e6b963332e2a8ae8af4df395b0d0107db0`
- Commits behind `main` at verification: 0
- Pull request state: draft and mergeable
- Production touched: no
- Production activation authorized: no
- Embedded activation authorization: no

## Bounded executable release

The executable pack is `econovaria.beta-seed-pack.v1`, version `1.0.0-beta`, and is approved only for an isolated synthetic staging environment.

The bounded counts are unchanged:

- 240 market instruments, exactly 24 per country;
- 10 arrival calibrations;
- 10 tutorial Contract chains and 30 Contract templates;
- 50 Store items;
- 144 physical-economy definitions;
- 50 artwork-verified locations.

The full 3,200-instrument design universe is explicitly excluded from runtime activation.

## Completed calibration evidence

The committed `calibration-scenarios-v1.json` and integrity manifest prove:

- financial enrichment for all ten countries, including Eldoran, Valerion, Lumenor, Xalvoria, Dravenlok, and Syndalis;
- 40 deterministic market paths: baseline, currency stress, route disruption, and war/recovery for every country;
- 45 currency-pair settlement and round-trip arbitrage checks;
- 13 bounded route calibrations;
- all 45 country-pair geometry relationships reviewed against current map geometry without inventing land-border claims;
- arrival viability, approved starting balances, housing deposits, ordinary expenses, and emergency reserves;
- Attendance and Contract reward-to-expense relationships;
- Store reward-to-price affordability;
- banking opening-deposit, fee, repayment, and emergency-credit affordability;
- household war-shock and recovery viability;
- all 12 substitution groups across difficulty penalties;
- salvage, arbitrage, recrafting, and concurrency/idempotency simulations.

Every recorded calibration failure count is zero. All ten country paths recover to at least 95% of their starting market index within the bounded horizon. The maximum war/recovery drawdown remains below the 35% ceiling and the maximum recovery day is 72.

## Map and location evidence

All 50 location coordinates are checked against:

- `player-terminal/assets/images/econovaria-world-map.png`;
- `player-terminal/src/data/map-regions.js`;
- the 1672 by 941 map coordinate space;
- current image and geometry SHA-256 digests;
- country polygon containment.

Route endpoints use verified locations. Adjacency evidence records geometry classifications without asserting unverified land borders.

## Import, activation, and rollback controls

The environment-restricted importer supports:

- `validate`;
- `dry-run`;
- `import`;
- `deactivate`;
- `rollback`.

It enforces stable-ID and natural-key mapping, game-session scoping, idempotent replay, rollback bundles, non-sensitive audit records, SHA-256 integrity, and an external expiring activation authorization matched to the exact pack digest.

It refuses production, project-ref mismatches, missing scope, missing or expired authorization, and the audited live project `cgiukdjwicykrmtkhudh` before any network write.

## Verified workflow evidence

All required workflows completed successfully on `a1320658cbde6fdaefd87b0acd9d88a005f63604`:

| Workflow | Run | Result |
|---|---:|---|
| Seed Executable Beta Pack | 29725811160 | success |
| Seed Beta Calibration | 29725811137 | success |
| Repository Quality | 29725811162 | success |
| Supply Chain Security | 29725811145 | success |
| Database Replay | 29725811123 | success |
| Staging Readiness Preflight | 29725811152 | success |
| Incident Readiness | 29725811186 | success |
| Admin Game Lifecycle Controls | 29725811164 | success |

The seed matrix includes deterministic rebuild, zero-drift comparison, hard validation, focused tests, every existing seed validator, importer validation and dry run, repository tests, Backend Deno and TypeScript typechecks, Backend smoke, migration audit, and structural seed-staging preflight. Database Replay applied the repository migrations from zero twice and linted the rebuilt database successfully.

## Remaining external blocker

Connected isolated-staging import, rollback rehearsal, and Admin/Player verification remain blocked because Chat 2 has not supplied:

- a distinct synthetic-only Supabase project;
- protected staging environment values and credentials;
- a staging game-session UUID;
- an approved unexpired activation authorization.

The only connected project currently visible is the audited live project `cgiukdjwicykrmtkhudh`, which is prohibited as a staging target. No paid resource was created and no production system was changed.

Repository-side executable-pack work is complete and rollback-capable. PR #163 must remain draft until the isolated staging import, connected rollback rehearsal, and Admin/Player evidence are captured.