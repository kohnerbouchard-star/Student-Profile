# Frontend Refactor Session Handoff

## Current Branch

`refactor/frontend-modular-copy-transplant`

## Current Git Status

```text
On branch refactor/frontend-modular-copy-transplant
nothing to commit, working tree clean
```

This status was captured before creating this handoff document.

## Commit List On This Branch

Latest first, relative to `main`:

```text
0805f5d feat: add guarded frontend dashboard profile switches
4baa276 test: add dashboard profile shadow checks
0508a5e refactor: copy dashboard profile into frontend modules
2afc7e5 feat: add guarded frontend store inventory switches
b327a6c test: add store inventory shadow checks
2b6b348 refactor: copy store inventory into frontend modules
0bfdad6 feat: add guarded frontend trading switch
f7fd3c8 test: add trading shadow checks
e2f518e refactor: copy trading into frontend modules
79abfd0 test: add frontend shadow module loader
055b90c feat: add guarded frontend snapshot store switch
af0f805 test: add snapshot store shadow checks
7864bcb refactor: copy snapshot merge into frontend store
3895906 feat: add guarded frontend api retry switch
9b39ad9 test: add api retry shadow checks
e3a3a82 refactor: copy api retry into frontend api client
a5ca5d6 feat: add guarded frontend market profile switch
3d76c9e test: add market profile shadow checks
3f9bbbf refactor: copy market profile into frontend modules
0a792f6 feat: add guarded frontend market news switch
b711e7c test: add frontend module shadow test harness
1a3f2e7 refactor: copy market news into frontend modules
35994cf chore: add inert frontend module scaffold
00f360c chore: scaffold frontend modular copy transplant
```

This list was captured before the handoff commit.

## Completed Work

- `frontend/` scaffold exists with docs, config, components, utils, core modules, feature folders, legacy bridge, and test harnesses.
- Runtime copies exist under `frontend/src/legacy/runtime-copies/`.
- Market News modules copied/extracted with shadow checks and disabled guarded switch.
- Market Profile / Market Data modules copied/extracted with shadow checks and disabled guarded switch.
- API retry module copied/extracted with shadow checks and disabled guarded switch.
- Snapshot store module copied/extracted with shadow checks and disabled guarded switch.
- Trading modules copied/extracted with shadow checks and disabled guarded switch.
- Store / Inventory modules copied/extracted with shadow checks and disabled guarded switches.
- Dashboard / Profile modules copied/extracted with shadow checks and disabled guarded switches.
- Manual shadow module loader exists at `frontend/tests/load-shadow-modules.js`.

## Safety Status

- Root `index.html` unchanged.
- Root `app.js` unchanged.
- Active root JS/CSS files unchanged.
- All feature flags remain `false`.
- Modular code is not loaded by root `index.html`.
- No backend, Supabase, API, server, database, migration, Worker, or worker folders were created.
- No `frontend/src/utils/money.js` was created.
- Root script cleanup has not started.

Current feature flags:

```text
useFrontendMarketNewsModule: false
useFrontendMarketProfileModule: false
useFrontendApiRetryModule: false
useFrontendSnapshotStoreModule: false
useFrontendTradingModule: false
useFrontendStoreModule: false
useFrontendInventoryModule: false
useFrontendDashboardModule: false
useFrontendProfileModule: false
enableFrontendShadowChecks: false
enableFrontendStoreShadowChecks: false
enableFrontendInventoryShadowChecks: false
enableFrontendDashboardShadowChecks: false
enableFrontendProfileShadowChecks: false
```

## Current Known Issue

- Local backend testing from `http://127.0.0.1:8080/` is blocked by Worker CORS because the Worker currently allows `https://kohnerbouchard-star.github.io` only.
- This is not a frontend refactor bug.
- Do not investigate CORS unless explicitly asked later.

## Next Recommended Step

Auth/Login copy-phase extraction only.

Do not do root script cleanup yet. Do not switch `index.html` to frontend modules. Do not archive, delete, move, or rename active root runtime files.

## Exact Next Codex Prompt Location

Continue from:

- `frontend/docs/session-handoff.md`
- `frontend/docs/code-transplant-plan.md`

## Test Commands To Rerun

```powershell
$files = Get-ChildItem -Path 'frontend' -Filter '*.js' -Recurse | Sort-Object FullName; foreach ($file in $files) { node --check $file.FullName; if ($LASTEXITCODE -ne 0) { Write-Output "FAILED $($file.FullName)"; exit $LASTEXITCODE } }; Write-Output "checked $($files.Count) frontend JavaScript files"
```

```powershell
node --check frontend/tests/load-shadow-modules.js
```

```powershell
git diff --check
```

```powershell
git status
```

## Browser Shadow Loader Commands

```js
const s = document.createElement("script");
s.src = "frontend/tests/load-shadow-modules.js";
document.head.appendChild(s);

window.loadEconovariaFrontendShadowModules()
```

## Available Shadow Checks

```js
window.compareLegacyAndFrontendMarketNews()
window.compareLegacyAndFrontendMarketProfile()
window.compareLegacyAndFrontendApiRetry()
window.compareLegacyAndFrontendSnapshotMerge()
window.compareLegacyAndFrontendTrading()
window.compareLegacyAndFrontendStore()
window.compareLegacyAndFrontendInventory()
window.compareLegacyAndFrontendDashboard()
window.compareLegacyAndFrontendProfile()
```
