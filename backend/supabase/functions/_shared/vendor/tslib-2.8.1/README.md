# Accepted tslib copy for Deno checks and Edge configuration

This is the byte-identical 11,226-byte module matching the original repository
lock entry for `https://esm.sh/tslib@2.8.1/denonext/tslib.mjs`:
SHA256 `c38da5dd6da6281964435002ce204cd586634fe3bdfb24a0ee116f48cf3292e9`.

The module and license were moved byte-for-byte from PR #889 parent
`ab10027632b45218cd31cf86641bb45b69f6fa1c`, where they were retained from
reviewed PR #885 source `8530faae8813200dce8b037946519dc8c29ac297`.
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

This is the sole module copy. The neutral, Admin and Classroom Deno configs and
the 26 other adjacent function configs map only the exact original URL here.
Compiler settings and the Classroom check task retain their previous values.
The retained `backend/scripts/typecheck-only/import-map.json` is a compatibility
map for the every-root checker and the two existing Cutover strict/Admin checks;
it now resolves to this same file. It contains no second implementation.

`trustedTslibConfigs` in `backend/scripts/verifyNeutralDenoTestConfig.mjs` verifies
the original remote lock entry, regular local file, 11,226-byte length/SHA256,
exact mappings and config shapes. The every-root checker delegates to it before
each invocation. Its static mode precedes the previously failing direct REF009,
REF018 and Seller Offers checks and the Onboarding, connected Cutover and
Multiplayer local Edge startup paths. Original commands, permissions, shared
lock and frozen checks remain intact. The separately approved Campaign change
aligns its SDK import from 2.45.4 to the existing locked 2.108.2 version and
disables retries for its reads; it does not change the shared lock.

The adjacent configs follow the pinned Supabase CLI2.109.1 deployment discovery
used by the reviewed PR885 design. Deno 2.9.3 checked all 28 roots with the
retained CI mapping and then separately with their actual adjacent configs,
each against the unchanged frozen lock. A real SDK 2.108.2 fake-fetch test and
one Deno missing-local-file control passed. These typechecks do not alone prove
the complete runtime SDK closure.

After the user published the restricted allowlist, the pinned Runtime1.74.2
image produced all 28 actual bundles, and three missing-local controls failed
at the expected shared helper path. The image manifest SHA256 is
`a82676277615aee03c4f288cbbbf68dedb5ba8693073e567ab8dbfdd11ba5d45`;
its binary reports Edge Runtime 0.1.0 and embedded Deno 2.1.4. The earlier
SDK2.45.4 closure blocker is historical; no new pins or rejected response
bytes are accepted here.

The user approved publishing this reviewed candidate to draft PR889 for its
original CI. Proof of the changed adapter against actual PostgREST scoped reads
and RPCs, and successful scheduler-token authorization, remains pending; local
database startup ran out of Docker vfs space before migration replay. Broader
Campaign replay, claim and lease obligations remain with their original REF046
lanes. Candidate exact-head CI, other retained gates and any hosted evidence
remain pending. No PR approval, merge, deployment, hosted database action or
release-hold change is authorized.
