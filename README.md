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

For a static UI-only preview, run:

```zsh
python3 -m http.server 4173 --bind 127.0.0.1
```

This static server does not provide a connected authenticated session. Open
`http://127.0.0.1:4173/` only for layout inspection.

For connected Admin and Player login against staging, use the repository-owned
local gateway. Supply the public staging publishable key through your local
environment; do not commit it into the repository.

```zsh
export ECONOVARIA_STAGING_PUBLISHABLE_KEY='replace-with-staging-publishable-key'

python3 scripts/local-staging-gateway.py \
  --project-ref eecvbssdvarfcykcfrny \
  --publishable-key "$ECONOVARIA_STAGING_PUBLISHABLE_KEY" \
  --port 4173 \
  --open
```

Then open:

- Login: `http://127.0.0.1:4173/`
- Admin: `http://127.0.0.1:4173/admin/`
- Player: `http://127.0.0.1:4173/player-terminal/`

The gateway sends Supabase Auth directly to the staging project and proxies only
Edge Function traffic through loopback. This preserves strict staging CORS while
allowing authenticated localhost testing. A game join code remains valid until
an administrator explicitly resets it; normal sign-in must not require a new
game code.

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
