# Native teacher Messaging policy controls

Roadmap item: `TEACHER-MESSAGING-POLICY-V2-001`. Status: `IN_PROGRESS`.
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
