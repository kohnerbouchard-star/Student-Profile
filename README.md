# Econovaria

Econovaria is a classroom economic simulation with a student terminal, an
administrator console, and a Supabase-backed domain/API layer. Students manage
country-linked currencies, attendance rewards, Store purchases, contracts,
inventory, and a simulated stock market while staff configure and supervise a
game session.

## Production status

The application is an active production candidate, not an approved
production-grade release. Modern `admin-api` and `classroom-api` services are
deployed, but launch remains blocked by database-history reconciliation,
legacy-service containment, controlled staging/promotion, and backup/plan
posture. Do not deploy from an unmerged branch or make manual schema changes.

The current audit and program are maintained in:

- `docs/operations/production-grade-execution-plan.md`
- `docs/operations/production-manifest-2026-07-17.json`
- `docs/operations/production-change-control.md`
- `docs/operations/legacy-service-containment.md`

## Repository map

- `frontend/` — modular student application source.
- `admin/` — authenticated v606 administrator shell and compatibility layers.
- `backend/src/` — domain logic, contracts, repositories, and platform adapters.
- `backend/supabase/migrations/` — the only normal database change path.
- `backend/supabase/functions/` — deployable Edge Function sources.
- `scripts/` — source, architecture, browser, and database validation.
- `docs/` — active operations, audits, plans, research, and worldbuilding.

The student runtime is temporarily split between modern Supabase capabilities
and an explicitly tracked legacy Worker. Do not add another backend or dual
write balances, inventory, rewards, contracts, or stock state.

## Local verification

Use the pinned Node release in `.nvmrc` and install both lockfiles.

```zsh
nvm use
npm ci
npm --prefix backend ci
npm test
npm --prefix backend run typecheck:all
npm --prefix backend run smoke
```

Run the static application locally:

```zsh
python3 -m http.server 4173 --bind 127.0.0.1
```

Then open `http://127.0.0.1:4173/` or
`http://127.0.0.1:4173/admin/`.

Database migrations must also pass the Docker-backed `Database Replay` GitHub
workflow, which resets a blank Supabase database twice and runs database lint.

## Security boundaries

- Public Supabase publishable keys may appear in browser configuration; service
  role keys, passwords, access codes, session tokens, and refresh tokens may not
  appear in commits, logs, issues, or artifacts.
- Browser identity is not authority. Every privileged route must authenticate,
  resolve the actor, and prove ownership of the target game before service-role
  access.
- Every game/player relationship must preserve `game_session_id` scope.
- Money, reward, inventory, attendance, contract, and trading writes must be
  transactional and idempotent.

See `CONTRIBUTING.md` for branch, pull-request, migration, and release rules.
