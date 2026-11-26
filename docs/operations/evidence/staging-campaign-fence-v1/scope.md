# Staging Campaign fence

Local candidate based on b62f10ffda169fd6f884cc3a254c136fbd6b862d. The
observed staging worker is v10, provider digest
b8f4f71163fbf5d313ef1d103c3cc529ab780c6576597e27644d9b5c77646fea.
That worker uses the legacy acknowledgement and scheduler token verifier.
The first observation of no queued requests or processing effects belongs
to the read-only preflight. Transaction drain has its own proof.

The database packet installs a committed hold and checks the exact original
routine bodies, owners, grants and dedicated token-row identity. Legacy token
verification returns false for Campaign while other schedulers use the exact
original verifier. The token row, Vault and Cron remain untouched. Old worker
effect/claim/ack privileges are removed. Admin mutation and provisioning
writes encounter a shared transactional hold. The shared route RPC preserves
Admin and Storyline key namespaces and keeps Campaign route keys reserved
through outbox deletion.

A new operator transaction must observe the committed held epoch, inspect all
database transaction activity and reject prepared transactions before it can
record drain. A previously entered transaction remains relevant even after
SQL privileges change. At open, the old verifier stays closed. The staged
worker admits once, then sends that epoch through the guarded claim, schedule,
delivery and acknowledgement calls. The effect gateway locks its claimed
row and checks the exact epoch, attempt, game, key and effect kind before
calling the existing durable write. Failed or stale operations stay rejected.

The explicit pre-suffix abort requires the same held and drained epoch, the
exact nonce baseline, absence of later ledger rows and absence of v2
acknowledgements. It restores original routine identities, definitions and
grants. Once the suffix starts, keep the hold and use the reviewed forward
recovery path. A subsequent hold rotates the epoch without releasing callers.

## Reproduce

Run from this worktree using Node 22.23.1 and the verified PostgreSQL 17
binary directory in STAGING_SUFFIX_SYNTHETIC_PG_BIN. Pass the immutable
native-test-support.mjs from PR #1064 head
da6e0dc5d6b311037dc221a53d148465c05768de.

    node scripts/operations/staging-campaign-fence/native.test.mjs /path/to/native-test-support.mjs
    node --test scripts/local-edge-runtime-contract.test.mjs

Native PostgreSQL 17.12 ran the exact original functions extracted from
repository migrations, including all four effect RPCs and all five effect
kinds. The fixture uses synthetic table shapes and a deterministic market
clock. It exercised held, in-flight drain, pre-suffix abort, explicit v2
resume, re-hold, legacy denial, wrong-role/game, stale epoch/attempt, replay,
Admin/Storyline route compatibility and the staged client adapter. It applied
the exact immutable acknowledgement migration inside the disposable fixture.
The immutable migration list and apply/recovery/runtime comparison/approval
controls are separate and unchanged. The staged adapter type-checked with
Deno 2.9.3. Full served qualification of this new artifact still needs the
locked SDK and native Edge/PostgREST lanes.

## Exact integration boundary

Use the existing protected staging project/primary binding and receipt
validation to qualify this packet before publication. The isolated SQL
packets have no hosted transport. The staged worker flag is bound to the
exact staging project URL and provider deployment identity. Read-only
staging preflight must confirm the ten exact procedure bodies/owners,
pg_read_all_stats, known write callers and project binding. This is a
Campaign fence, with separate scope for other suffix writers or direct
privileged SQL outside the reviewed routes. Any post-install catalog
overlay must be explicitly reviewed as an exact delta in the existing
comparison. The partner worker still needs a bound artifact and a held
smoke path that cannot claim unrelated games before operator resume.

No provider worker termination claim is needed for the known legacy paths.
Queued legacy traffic must still encounter the closed SQL entry points.
PostgreSQL transaction activity and Supabase routing configuration are
independent observations.
