# Accepted tslib copy for Edge typechecking only

This is the byte-identical 11,226-byte module matching the original repository
lock entry for `https://esm.sh/tslib@2.8.1/denonext/tslib.mjs`:
SHA256 `c38da5dd6da6281964435002ce204cd586634fe3bdfb24a0ee116f48cf3292e9`.

The module and license were copied without acquisition or modification from
reviewed PR #885 source `8530faae8813200dce8b037946519dc8c29ac297`, originally
at `backend/supabase/functions/_shared/vendor/tslib-2.8.1/`.
That source retained one HTTP200 JavaScript/identity-encoding DATA observation
from REF009 run 41172691709, job 124453825349, candidate
`eb9fb5dbd3af152129f1fbc1c29fd4e884ece574`. Its candidate-bound log frame was
validated for ordering, decoded length and digest. This was a new Python-client
observation, not recovery of a failed Deno response. No new CDN response or hash
was accepted here. The cause and bytes of rejected `ebce3cd5...55905ca` responses
remain unknown. Matching 32 named helpers with Microsoft's tagged source was
a static observation, not complete semantic or transformation provenance.

The accompanying tslib 2.8.1 0BSD license preserves all legal terms. Its prior
reviewed transformation normalized only 11 CRLF pairs to LF, retaining the
original final-line ending state: original 655-byte SHA256
`210b19e543130388c68654b7497e967119ce17145f66ab7d85688fbd70f08751`,
accepted 644-byte SHA256
`0e8d2550baea17eb3072c4f919b36fbf9852bb49dba948549872e713863c0834`.
Official tagged source: https://github.com/microsoft/tslib/tree/v2.8.1 .
The CDN module is minified and includes an additional default aggregate export;
its original sourceMappingURL comment remains untouched. No source map is fetched.

Only `backend/scripts/typecheckAllEdgeRoots.mjs` explicitly consumes
`backend/scripts/typecheck-only/import-map.json`. It maps the original URL to these bytes
for its existing three configuration groups and all discovered Edge roots.
The runner verifies the original remote lock entry, local module length/SHA256,
map shape and unchanged effective config shapes before invoking Deno. Compiler
settings, the shared lock, `--frozen`, roots and package commands remain intact.

All callers of this every-root checker, in CI or locally, use the map. Other
Deno invocation paths, deployments, bundles, Edge startup and SDK2.45.4 runtime
closure are unchanged. This supplies no runtime, bundle,
hosted or full-workflow qualification claim. The existing full `typecheck:all`
and complete Timezone workflow still require qualification; a mapped-import
fixture is not a substitute. Future integration with PR #885's broader runtime
mapping must reconcile configuration guards and shared tests explicitly.
