# Native teacher Messaging policy controls

Roadmap item: `TEACHER-MESSAGING-POLICY-V2-001`. Status: `IMPLEMENTED_NOT_MERGED`; draft [PR #995](https://github.com/kohnerbouchard-star/Student-Profile/pull/995), published source `3cd24bec7ec59545f5ad86e143b5d1e9e4980e39`, matching local tree `d9e17ce32b5c5a24b5cb8c4db54960c6708fbadd`.
Base: merged main `956ad02db949ae9c4cff7d709a18ec28d20c0788` (#993).

Fresh open-PR audit found #938/#933 classroom roster, #735/#731 release work and
#624 styling; none owns this capability. The legacy Messaging policy client and
surface already expose policy, while native V2 offers moderation only. This slice
makes the existing policy usable in native V2 without changing backend authority.

## Scope

- Source-owned V2 Messages panel: allow/disable Player-created conversations and
  default retention (1–730 whole days), with explicit review before a write.
- Existing same-origin game-scoped `GET/POST /messages/policy`; no new RPC, migration,
  permission, secret, scheduler, deployment or economic write.
- Server `messaging.moderate`, AAL2/CSRF/rate-limit and game isolation remain
  authoritative. Browser checks permission before reads and again before saving.
- Only the two permitted fields are sent. Policy projection fails closed when
  malformed or attachments are not explicitly disabled. No identifiers rendered.
- Drafts remain memory-only across moderation redraws; route exit aborts requests,
  destroys review, discards drafts and ignores late results. Failed initial load
  cannot enable writes. Failed save preserves input and requires authoritative
  reload to resolve uncertainty. Existing backend offers no version/CAS field, so
  simultaneous staff saves retain existing last-write-wins semantics.
- Retention default is not a bulk-delete operation. Existing moderation remains.

## Verification

37 focused Messages tests pass, including eight new policy cases. The original
read-panel function hashes are preserved except the reviewed `MessagesRoute`
policy-panel mount. Browser fixture now covers loading, draft editing, cancel,
review/save and overflow at 1440/768/390/320 widths. Local execution currently
blocked by missing pinned Chromium; browser pass is not claimed. Initial root
aggregate stopped on generated inventory drift; the deterministic inventory is
included and must be rerun after commit. Node available initially is 24.22.1,
not the required hosted Node 22.23.1. Exact-head hosted qualification remains
required; no live deployment or runtime acceptance is claimed.

Next: independent review, draft publication, actual-PR bound authority and full
exact-head qualification. No merge is authorized for this feature tranche.

## Qualification checkpoint

37 focused tests and full root aggregate pass on pinned Node 22.23.1; the earlier
Node 24 run also passed after inventory commit. Core backend TypeScript and secret
scan pass. Full Edge and backend smoke stop because Deno is unavailable. Browser
installation is unavailable locally; expanded fixture execution remains required
in CI. PR995 authority locks 16 changed paths plus two read-only verifier/test
paths; current YAML derives 35 workflow families, 69 active tuples and five guarded
skips, with CodeQL separate. No gate is waived, no live acceptance is claimed.
Next: independent source/metadata review and final exact-head hosted qualification.

## CI correction checkpoint (2026-11-17)

Published source `3cd24bec7e` completed seven cross-domain source workflows with
`Player authority identifier is not bound to this pull request`: the reviewed
PR995-specific metadata was still local because public upload approval was
pending. This is not a waived gate; publish the exact approved manifest and
requalify the new head. Hosted database/connected jobs in those workflows passed.

The Messages browser job `133714838121` separately timed out on an exact label
lookup. Shared AdminField adds a required indicator to the accessible name. The
smoke now locates the required retention spinbutton by its actual accessible name
and asserts native required semantics; it retains the same edit/cancel/save and
responsive-overflow checks. No runtime behavior or verifier is changed. All 68
focused Messages tests pass. Local system Chromium launch fails at process
singleton socket creation (EPERM); hosted browser rerun is still required.
