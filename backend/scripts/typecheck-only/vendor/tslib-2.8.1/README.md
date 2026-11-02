# Accepted tslib copy for Cutover CI typechecks only

This is the byte-identical 11,226-byte module matching the original repository
lock entry for `https://esm.sh/tslib@2.8.1/denonext/tslib.mjs`:
SHA256 `c38da5dd6da6281964435002ce204cd586634fe3bdfb24a0ee116f48cf3292e9`.

The module and license were copied without acquisition or modification from
reviewed PR #888 source `1b350848b00140d1b1069615afc2ea8a0de4b49a`, where they
were retained from reviewed PR #885 `8530faae8813200dce8b037946519dc8c29ac297`.
That source retained one HTTP200 JavaScript/identity-encoding DATA observation
from REF009 run 41172691709, job 124453825349, candidate
`eb9fb5dbd3af152129f1fbc1c29fd4e884ece574`. Its candidate-bound log frame was
validated for ordering, decoded length and digest. This was a new Python-client
observation, not recovery of a failed Deno response. No new CDN response or hash
was accepted here. The cause of rejected `ebce3cd5...55905ca` responses remains
unknown. Matching 32 named helpers with Microsoft's tagged source was a static
observation, not complete semantic or transformation provenance.

The accompanying tslib 2.8.1 0BSD license preserves all legal terms. Its prior
reviewed transformation normalized only 11 CRLF pairs to LF, retaining the
original final-line ending state: original 655-byte SHA256
`210b19e543130388c68654b7497e967119ce17145f66ab7d85688fbd70f08751`,
accepted 644-byte SHA256
`0e8d2550baea17eb3072c4f919b36fbf9852bb49dba948549872e713863c0834`.
Official tagged source: https://github.com/microsoft/tslib/tree/v2.8.1 .
The CDN module includes a default aggregate export; its original sourceMappingURL
comment remains untouched. No source map is fetched.

Only the two existing explicit strict-root and Admin checks in
`.github/workflows/business-player-store-cutover-v2.yml` consume
`backend/scripts/typecheck-only/import-map.json`. Each invokes
`backend/scripts/verifyTypecheckOnlyImports.mjs` immediately before Deno to
verify the original remote lock entry, local module length/SHA256, exact-one-URL
map and unchanged strict/Admin config shapes. The existing root lists, compiler
settings, lock, frozen flags and qualification failures remain enforced.

This does not change `typecheckAllEdgeRoots.mjs`, package commands, runtime
configuration, deployment resolution, Edge startup or other Deno invocations.
It establishes no runtime bundle or SDK2.45.4 closure qualification. The original
full Cutover workflow and connected Multiplayer acceptance still require actual
exact-head CI evidence; local guard and mapped-import fixtures are not substitutes.
