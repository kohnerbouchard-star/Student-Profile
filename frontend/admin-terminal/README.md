# Econovaria Admin Terminal Integration

This directory is reserved for the new Econovaria admin terminal frontend.

## Current status

The accepted admin terminal work was developed outside the GitHub repo as package versions. The GitHub repo currently contains the older/player-facing runtime. This branch adds the integration handoff and Codex instructions so the admin terminal can be landed as real source and wired to the Supabase `classroom-api` backend.

## Baseline to import

Use the clean admin terminal baseline:

- Keep the accepted Marketplace UI/chart work through `v527`.
- Preserve the `v529` change that moves Call/Put options into the order ticket.
- Do **not** carry forward the Settings experiments from `v528`, `v530`, or `v531`.
- Settings remains out of scope until backend wiring is stable.

## Target source layout

Codex should place the real admin frontend source here:

```text
frontend/admin-terminal/
  index.html
  package.json
  css/
  src/admin-overview/
  tools/
```

The source package should keep the fragment-based build until a deliberate refactor is made. Do not patch only generated `dist` output.

## Backend wiring rule

Add a thin admin API adapter before wiring page renderers. The adapter should own route URLs, staff auth headers, error normalization, payload shaping, and idempotency keys.

Recommended adapter path:

```text
frontend/admin-terminal/src/admin-overview/adminApi.js
```

Do not wire pages directly to `fetch()`.

## Marketplace warning

The current Supabase stock execution backend supports simple buy/sell only. Advanced UI controls for shorts, options, stop loss, and stop limit must stay preview-only until backend contracts, migrations, and RPCs support those payloads.
