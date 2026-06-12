# Frontend Architecture

## Current Runtime Model

The production app is a static GitHub Pages frontend. It runs from root-level
files such as `index.html`, `app.js`, `style.css`, and root-level patch
scripts. `index.html` still loads the root scripts directly with script tags.

## New Refactor Model

All new refactor work lives under `frontend/`. The new folder is frontend-only
and does not include backend, Supabase, Cloudflare Worker, Google Apps Script,
database, migration, or API server code.

The folder is organized by responsibility:

- `config/` contains disabled runtime configuration and feature flags.
- `src/core/` contains app coordination primitives such as API client, state,
  routing, permissions, and DOM event helpers.
- `src/utils/` contains pure formatting, sanitizing, date, number, currency,
  and DOM helpers.
- `src/components/` contains small reusable HTML view helpers.
- `src/features/` contains feature-specific controllers, services, selectors,
  and views.
- `src/legacy/` contains bridge files, patch registry notes, and clean copies
  of active root runtime files.
- `styles/` contains modular CSS candidates.
- `docs/` records architecture, migration, API, state, and testing rules.
- `tests/` contains manual and shadow test helpers.

## Copy, Test, Transplant

The refactor is deliberately staged because the root runtime is the active
production path. Every replacement starts as a copied module, is tested in
shadow mode, then is switched only behind a disabled feature flag. The root
runtime stays untouched until module behavior passes tests and manual approval.

## Backend Boundary

Backend and Supabase work is excluded from this branch. Cloudflare Worker
behavior and action names are not changed here. A future API client can point to
the current Cloudflare Worker or another backend implementation, but this task
does not change the active API URL or contract in `app.js`.

## Fetch Boundary

Feature files should not call `fetch` directly. They should coordinate through
`frontend/src/core/api-client.js` once that module is adopted.

## Calculation Boundary

Frontend calculations are display-only unless explicitly labeled otherwise.
Selectors may derive rows for presentation, previews, sorting, filtering, and
formatting, but they must not mutate state. Source-of-truth calculations for
balances, purchases, trades, portfolio positions, inventory, ratings,
attendance, rewards, payroll, market prices, price history, or generated news
remain in the backend/API.
