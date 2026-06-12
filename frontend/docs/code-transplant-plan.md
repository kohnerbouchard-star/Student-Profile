# Code Transplant Plan

## Transplant Order

1. Market News
2. Market Profile / Market Data
3. API client / retry
4. Snapshot merge
5. Trading
6. Store / Inventory
7. Dashboard / Profile
8. Auth / login
9. Root script cleanup after tests pass

## Required Flow

Each transplant follows the same path:

copy -> modularize -> shadow test -> feature flag switch -> manual test ->
index.html switch -> archive old runtime file

No active root runtime file is deleted, moved, or renamed before the modular
replacement is proven stable.
