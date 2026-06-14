# Behavior-preserving frontend refactor plan

This branch refactors the working live site into the existing `frontend/` folder system without changing app behavior.

## Goal

Move the stable root-level frontend code into organized folders while keeping the live UI, copy, backend calls, global function names, and render output unchanged.

## Move-only protocol

This branch uses a strict move-only refactor protocol.

Allowed changes:

- Move an existing frontend file into the agreed folder system.
- Update `index.html` script paths so the same file still loads in the same relative order.
- Temporary checkpoint loader/config scaffolding has been removed from the production load path.
- Add docs that explain the move.

Disallowed changes:

- No renderer rewrites.
- No copy edits.
- No CSS redesigns.
- No backend/API/action/payload changes.
- No state model changes.
- No replacement renderers.
- No new feature-flag runtime system.
- No broad cleanup commits.
- No removing globals.
- No changing load order unless the change is required only because a file path moved.

Every move must be small enough that the browser can be tested immediately after the commit.

## Non-goals

- Do not replace working legacy renderers with redesigned runtime renderers.
- Do not enable the modular runtime feature-flag bridge as the production path.
- Do not change backend contracts, Cloudflare Worker calls, Apps Script actions, or Google Sheets shape.
- Do not delete root files until their folderized replacements are proven equivalent.

## Target folder system

```text
frontend/
  config/
  src/
    components/
    core/
    features/
      auth/
      dashboard/
      store/
      inventory/
      market/
      trading/
      portfolio/
      forecasts/
    legacy/
    utils/
```

## Refactor rules

1. Preserve behavior first. Move code, do not rewrite it.
2. Keep global compatibility during Phase 1. Existing functions such as `renderStore`, `renderProfile`, `renderTrade`, `purchaseItem`, and `useItem` must continue to exist.
3. Keep exact user-facing copy unless a copy-only patch is intentionally isolated.
4. Keep exact backend action names and payload shapes.
5. Test after every extraction.
6. Delete old root code only after the folderized version is confirmed stable.
7. Prefer one moved file per checkpoint commit.
8. If a move requires editing function bodies, stop and create a separate review note instead.

## Recommended extraction order

1. Utilities and formatters
2. Auth/login helpers
3. Copy cleanup helpers
4. Store renderer and purchase action
5. Inventory/use-item renderer and action
6. Market news only
7. Market Data renderer
8. Portfolio renderer
9. Trading renderer
10. Forecast renderer
11. Dashboard/Profile overview renderer
12. Cleanup root compatibility files

## Stability checklist after each step

- Login works.
- Refresh works.
- Store item data still loads.
- Use Item card still appears.
- Items table still appears exactly once.
- Market Data rows still load.
- Trading UI still appears.
- Forecast UI still appears.
- Logout/Login cycle still works.
- Console has no new app-file errors.
