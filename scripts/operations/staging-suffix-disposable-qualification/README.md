# Disposable qualification of the held staging suffix

This harness exercises the SQL returned by the exact active renderer in
f04d410fe6566e66920316ae0600f808fe4569f2. The staging workflow, approvals,
live evidence, recovery receipts and migration files are outside this test.
The harness emits disposable results with live authorization set to false.

The engine and deterministic whole, schema and data snapshots use the pins
and reviewed method from [#1064](https://github.com/kohnerbouchard-star/Student-Profile/pull/1064).
The Campaign installer is the exact blob
905a3ca4599893b41fe733151cd4a74590032168 from
[#1066](https://github.com/kohnerbouchard-star/Student-Profile/pull/1066).
The fresh managed baseline is the repository's 449-migration nonce prefix.
Nineteen marked and inert ledger rows give the fixture the 468-row baseline
cardinality required by the renderer. They correspond only to the count.

The non-Campaign functions in the disposable state fixture model the two
required writer interfaces and the transactional recovery seal. They give
no coverage of real writer admission, Auth, R2, or the operator's recovery
evidence. The Campaign smoke uses the exact SQL RPC as service_role. Its
served Edge acceptance is the separate review in #1066.

## Execute

Use a nonroot Linux amd64 machine with Node.js, Python 3, Git, util-linux
unshare, Bubblewrap and working private AF_UNIX sockets. Private user, mount,
PID and network namespaces must be available. About 3 GiB of free temporary
disk is sufficient. These commands install nothing system-wide. They fetch
only fixed public artifacts before starting an isolated database.

```bash
set -eu
umask 077
suite=scripts/operations/staging-suffix-disposable-qualification
scratch=$(mktemp -d /tmp/econovaria-suffix-fixture.XXXXXX)

python3 "$suite/acquire-image.py" "$scratch/oci"
curl -fsSL https://github.com/opencontainers/umoci/releases/download/v0.5.1/umoci.linux.amd64 \
  -o "$scratch/umoci"
(cd "$scratch" && printf '%s\n' \
  '4406d5ea5dff7ad92982f592e80ad665eb90318e083b1adb57083528bd19fa84  umoci' | sha256sum -c -)
chmod 700 "$scratch/umoci"

mkdir "$scratch/cli-v2.109.1"
for template in schema.sql webhook.sql _supabase.sql; do
  curl -fsSL "https://raw.githubusercontent.com/supabase/cli/v2.109.1/apps/cli-go/internal/db/start/templates/$template" \
    -o "$scratch/cli-v2.109.1/$template"
done

node --test "$suite/entry.test.mjs" scripts/operations/staging-recovery-evidence/owner-approval.test.mjs
node "$suite/run-rootless.mjs" "$scratch/oci" "$scratch/umoci"
```

The runner rechecks the pinned image/config/layer bytes and CLI template
blobs, uses the image's managed entry point and the CLI's original
three bootstrap templates, disables the disposable scheduler and binds
database I/O to the private filesystem socket. It replays the canonical
prefix and uses the real Campaign hold and fixture enrollment. Read the
first failing stage before proceeding. If the preflight passes, the runner
exercises:

- Wrong database, ledger digest, Campaign epoch and modeled writer epochs.
- Explicit rollback and a forced P0001 after migration 20261007221252,
  with stable whole, schema, data and scheduler comparisons.
- Exact held commit, all 15 inserted ledger identities and reviewed
  postconditions, and a rejected retry with unchanged committed state.
- Held Campaign smoke, denial of premature resume, and separate explicit
  verified Campaign resume. The simulated non-Campaign fixture stays held.

For a bounded diagnostic on a runtime that cannot open a socket, append
--guard-only to the run-rootless command. This uses PostgreSQL single-user
mode on fresh disposable data and evaluates only the first exact rendered
guard on the wrong database. It cannot qualify the combined transaction.

## Current evidence

On the attached cloud, offline entry and renderer checks and the pinned
PostgreSQL 17.6 wrong-database guard passed. The latter returned P0001 for
STAGING_PRIMARY_OR_OPERATOR_UNVERIFIED and left the empty wrong-target
ledger unchanged. Managed bootstrap reached the PostgreSQL listener but
AF_UNIX bind returned EPERM. Independent file and abstract UNIX probes
also returned EPERM, and isolated loopback returned ENETUNREACH.
The full managed rollback, forced failure, commit, and resume are NOT_RUN.
Use the full command on an ordinary socket-capable contained Linux runner
to complete those checks. The operational qualification record remains
NOT_RUN.
