# Frontend Refactor Area

This folder is the new frontend-only refactor area for Econovaria.

The current production runtime still lives at the repository root through
`index.html`, `app.js`, `style.css`, and the active root-level patch scripts.
Those files remain active until copied modules are tested, guarded, and
approved for transplant.

This folder does not contain backend code, Supabase code, Cloudflare Worker
code, Google Apps Script code, database migrations, or API server code.

The refactor strategy is copy, test, transplant:

1. Copy active root runtime files into `frontend/src/legacy/runtime-copies/`.
2. Build inert modules under `frontend/src/`.
3. Shadow-test module behavior against the current runtime.
4. Add disabled feature flags for safe switches.
5. Transplant one feature at a time only after manual approval.

Frontend calculations must stay display-only unless a function is explicitly
classified otherwise. Source-of-truth calculations remain in the backend/API.
