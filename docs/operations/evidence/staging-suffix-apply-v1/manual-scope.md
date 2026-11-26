# Manual staging suffix candidate

OPS-STAGE-001 is in progress. This local source starts from reviewed main
`3b4d70093b15d178ecb343d964b0f441de4fe042` and targets only Supabase
staging `eecvbssdvarfcykcfrny`. The two workflows are manual, protected
by the staging environment, and restricted to same-repository current
main, attempt one. The apply step references the existing staging
`SUPABASE_DB_URL` only after its evidence step emits `apply_ready`.
The apply entry point revalidates the same evidence before starting
one TLS-verified direct or session-pooler `psql` command.

The atomic renderer preserves the approved nonce and all 15 raw source
hashes, normalized migration bodies, postconditions and ledger identities.
It takes the ledger lock before observing the full predecessor digest.
It requires the authorized 468-row predecessor and verifies 483 rows
with the unchanged predecessor after the suffix. The temporary purge
snapshot carries the original reviewed definition and metadata checks
without creating a permanent fixture. The hash-bound Campaign hold,
non-Campaign write hold and closed admission epoch are required inside
the same transaction. Both recovery and Campaign are sealed before commit.
A successful apply leaves all holds closed. Commit ambiguity requires
a read-only observation of the same ledger and hold before recovery.

## Published source

- [PR 1064](https://github.com/kohnerbouchard-star/Student-Profile/pull/1064)
  at `da6e0dc5d6b311037dc221a53d148465c05768de` supplies the exact
  compiler and reviewed predicates. Its disposable proof belongs to
  [run 45758638607](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/45758638607).
- [PR 1066](https://github.com/kohnerbouchard-star/Student-Profile/pull/1066)
  at `2e91c85a5e8b44f0643387724ab7122d43b9213c` supplies the four
  installed Campaign procedure body hashes and the hold and seal protocol.
  Its isolated served proof belongs to
  [run 45768104640](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/45768104640).
- [PR 1069](https://github.com/kohnerbouchard-star/Student-Profile/pull/1069)
  at `ffc00af4592b3e5138ca4dcbd510bc7b1b43b8bb` supplies the exact receipt
  verifier, independent staging approval, protected recovery publisher
  and the held qualification record. The adapted request loader binds
  the new executable and predicate sources to its qualification digest.
  Rehearsal still requires exact current source, artifact provenance and
  strict runtime comparator exit zero.

## Live apply remains held

The checked-in qualification is `NOT_RUN`. The pinned disposable CI
cannot issue qualification for this combined transport. It still needs
exact reviewed postcondition hashes and the transactional operator proof.
The protected source then requires the genuine target-specific recovery
receipt with measured timing, real connected recovery checks and
independent approval. The current branch-only staging environment does
not produce the independent approval that published PR 1069 requires.
A separately approved owner-signoff policy would need its own reviewed
binding if used in its place.

The published verifier produces `applyAuthorized: false` and
`fenceVerified: false`. A reviewed authority must bind an actual current
staging ledger digest and installed hold epochs to the target and source.
It must account for Campaign old-worker effects, every affected direct
or relayed Auth transition and destructive R2 purge, timed manufacturing
and Store writers, and privileged or external writers. The known
Campaign SQL is consumed as an already-installed hold. This candidate
contains no installer for the unpublished non-Campaign controls.
No dispatch input can supply a writer permit. Missing `psql` also blocks
readiness before the database credential step.

This local candidate leaves provider routing configuration outside the
patch. Before any eventual publication, confirm the exact branch and
default-branch publication have no Supabase or Vercel deployment effects.
