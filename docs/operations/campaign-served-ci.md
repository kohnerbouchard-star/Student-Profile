# Campaign served-worker source qualification

Separate owner branch fix/campaign-served-worker-20261126, based on exact
b62f10ffda169fd6f884cc3a254c136fbd6b862d. PR1064 suffix qualification is unchanged.
Kohner authorized the isolated runner acquisition and disposable test in
Sentinel_0ffa79e77214819180db4217b3518cb3. No hosted data, environments, secrets,
manual dispatch, deployment or merge is part of this lane. Vercel deployment is
explicitly disabled for this exact branch before its first publication.

The pull-request-only job installs repository-locked CLI2.109.1 with scripts
ignored; pinned Deno2.9.3 resolves the unchanged worker graph under the frozen
shared lock. Each remote module's actual bytes must match that lock before it
is copied into a local module tree. Generated import-map scopes preserve each
verified module's dependency resolution without changing worker source. Unpinned,
modified or unresolved modules fail. No standalone Deno bundle/esbuild is used.

The official Edge Runtime1.74.2 GHCR OCI index is pinned to
sha256:a82676277615aee03c4f288cbbbf68dedb5ba8693073e567ab8dbfdd11ba5d45.
Actual index bytes, unique linux/amd64 child, child bytes and image-config ID are
verified before runtime execution. No ECR equivalence or architecture child is
assumed. The cached image runs by exact image ID with pull-never, readonly source
and verified module mounts, readonly root, bounded tmpfs, dropped capabilities,
no-new-privileges and no published worker port. Acceptance uses the inspected
owned internal bridge address; fixture SQL uses the inspected database container
and its local PostgreSQL socket. Readiness must return405 before seeding. Its only network is a fresh internal
bridge containing the disposable CLI database/API/Auth/PostgREST stack. Modules
are already localized; runtime has no registry or hosted route.

The unchanged campaign-orchestrator entrypoint is served as the Runtime main
service. This exercises actual provider engine loading, Deno.serve, real SDK,
scheduler verifier and PostgREST RPCs. It does NOT prove hosted user-worker limits,
provider deployment packaging or hosted bundle identity. Those remain separate.

Acceptance derives from PR889 INSERT-only synthetic scheduler token/staff/game
ownership and canonical event RPC, plus REF046 real claim/ack/retry semantics.
It tests method and missing-token rejection; real v2 completion; completed replay;
missing-definition v2 failure; repaired-definition retry; and deterministic
synthetic generation replacement at destination insertion causing a stale worker
completion to report lease loss. A subsequent expired-claim retry must complete
without another notification. This is not a simulated overlapping cloud invocation.
SQL, local generated credentials and raw command output remain private and are
removed on cleanup. Only allowlisted check booleans and fixed stages are public.

The job always stops/removes its inspected runtime ID, stops the fresh disposable
CLI project with no backup, removes its internal network, and removes temporary
module/cache/credential files. Failures never produce a release certificate.

References used as recipes only: docs/operations/evidence/player-public-imports-
main-v1/scope.json freshCloudRuntimeQualification; REF018 PR889 client/PostgREST
acceptance; PR884 job113696057116 real event/lease setup. The older PR889
job41548821808 log endpoint returned404. No historical pass is reused as current
qualification. Only this exact published head's natural CI can qualify the new test.

Actual first runs failed before worker startup. The vendor helper originally
hashed Deno's entire HTTP cache file rather than module content. Pinned Deno2.9.3
libs/cache_dir/global/cache_file.rs documents its final metadata envelope. The
correction accepts only valid URL-matched metadata and still requires the original
content SHA256 to equal the unchanged lock. Malformed wrappers, wrong URLs and
tampered content fail. No lock or upstream source identity is changed.
