# Admin UI V2 Contracts Evidence

Branch: `refactor/admin-ui-v2-contracts-v1`
Base: `b7827211f0ff15b8a963219a63738180b33a1b3d`
Route permission: `contracts.manage`

## Audited authoritative surfaces

The implementation was bounded to the existing Contracts domain and Admin/BFF paths. The audit confirmed game-scoped contract list/create/publish, progress reads, submission projection, review decisions, reward issuance, archive, and duplicate. Contract templates exist in the domain model but no Admin/BFF template-management route was found, so no template CRUD was created.

## Acceptance matrix

The targeted automated coverage is expected to verify:

- 0 contracts / authoritative empty state;
- one contract;
- many contracts;
- long descriptions/instructions;
- Korean and other non-ASCII display content;
- draft, scheduled, active, paused, completed, expired, and archived lifecycle display;
- search and lifecycle/category filtering;
- detail drawer with participant progress and evidence;
- create validation and canonical mutation payloads;
- publish, archive, duplicate, review, and reward-issuance mutations;
- safe failure envelopes without backend diagnostics;
- `contracts.manage` denial;
- no visible/accessibility/data-attribute UUID leakage;
- desktop and mobile responsive behavior;
- Overview, Store, and Market route ownership/regression assertions.

## Verification commands

Targeted source/API contract tests:

```sh
node --test scripts/admin-v2-unit.test.mjs scripts/admin-v2-contracts-api.test.mjs
```

Contracts browser acceptance:

```sh
node scripts/admin-v2-contracts-browser-smoke.mjs
```

Existing V2 regression suites:

```sh
npm run test:admin-v2
npm run test:admin-v2:browser
npm run test:admin-v2:store-browser
npm run test:admin-v2:market-browser
```

Browser evidence, when the smoke script is executed, is written into this directory as screenshots and `admin-v2-contracts-browser-results.json`.

## Deliberate exclusions

- No contract-template management control is rendered because no authoritative Admin/BFF template CRUD route was found.
- Resource UUIDs are held only in controller closures/internal read models for authoritative addressing and are not evidence/display values.
- No backend contract semantics were modified as part of this UI migration.
