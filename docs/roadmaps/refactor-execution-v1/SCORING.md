# Evidence-based module reassessment

Use this rubric for REF-003 baseline measurements and REF-050 reassessment. It is a reviewer rubric, not a statistical defect probability or runtime certification. The preceding conversational scores and deletion percentages are not measured baselines. Re-score from exact source and evidence rather than preserving them for consistency.

## Scope and evidence record

For each module record its actual production entrypoints, source paths, related UI/adapters, database authorities, tested operations, reference SHA, reviewer and evidence date. An apparently clean `backend/src/domains/business/` directory does not establish that every Business SQL routine, browser flow and scheduled worker is equally clean. Report the evaluated scope explicitly.

Record both status and evidence type: inspected source, static analysis, executed unit/contract tests, fixture-backed browser tests, disposable-database race tests, connected staging, authenticated production and human playtest. Do not treat these as interchangeable. Missing evidence is NR (not rated), not an assumed pass. Unknown external reachability remains unknown.

## Scoring method

Each dimension has five criteria. Score a criterion 0 when inspection establishes a material failure, 1 when evidence establishes partial fulfillment, or 2 when the stated criterion is satisfied in the evaluated scope. Every entry needs its rationale and source/test evidence. Use NR when not assessed. A dimension is reported out of 10 only when all five criteria have been assessed; otherwise publish the criterion values and `dimensionScore: null`. Do not prorate away unknowns or label unrun tests N/A to manufacture a high score.

Compare before/after scores only on the same scope and rubric. For cross-cutting modules where a criterion genuinely does not apply, document a replacement criterion before either measurement and keep it fixed. No repository-wide average is required: a high mean cannot cancel a known auth, ledger, isolation or release blocker.

### Architecture

1. One documented authoritative implementation per evaluated mechanic; adapters do not duplicate its rules.
2. Explicit public contracts and dependency direction; no unexplained cross-domain infrastructure access.
3. Server-derived game/actor context and data ownership are preserved through evaluated paths.
4. Persistence, pure calculation and transport responsibilities are separated where doing so improves clarity without breaking transactions.
5. Cross-domain orchestration preserves the existing atomicity and authoritative state; scoped aggregation reads are explicitly owned.

### Maintainability

1. The evaluated change has a small, understandable caller/implementation surface with no competing runtime path.
2. Names and locations accurately describe current ownership rather than misleading obsolete labels.
3. Cohesive functions/components can be characterized independently; size alone is not a failure.
4. Error, cancellation, lifecycle and cleanup behavior is explicit rather than scattered across global interception.
5. Current documentation/test registration identifies the exact owner, supported contracts and next maintenance action.

### Verification

1. Executed behavior-parity tests cover the evaluated successful path at the reported SHA.
2. Executed denial, malformed-input and dependency-failure cases cover its boundaries.
3. Executed replay/concurrency/rollback or read-ordering/session-isolation tests cover relevant state risks.
4. Relevant build/typecheck/architecture/secret checks pass on the same source without weakened assertions or raised ceilings.
5. The evidence level required by the change is present: fixture UI is not connected staging, and source acceptance is not production certification. For strictly source-only pure moves, justify why live evidence is not required; never extend that justification to an auth/runtime release.

A test file's presence, number of test files or old green CI result does not by itself earn executed-verification credit. Report known coverage gaps separately from scores.

### Approved-requirements fit

1. The evaluated behavior maps to a current owner-approved requirement or retained compatibility obligation.
2. Its decision/action/result is represented truthfully to the user rather than by placeholder success or fabricated data.
3. Authorization, economic and gameplay semantics match the approved specification.
4. Required failure/absence/decline/accessibility behavior is preserved.
5. Source and acceptance evidence distinguish implemented, reachable, deployed and intentionally retained behavior; no planned feature is counted as complete.

This dimension does not rate whether players enjoy the game. Enjoyment, learning outcomes and narrative quality require appropriate user evidence and remain separate from technical refactoring.

### Legacy containment and retirement readiness

1. Candidate code is classified by actual purpose rather than token matches or age.
2. Required callers include static, dynamic, HTML/build, SQL/job and external runtime paths where applicable.
3. Each retained compatibility path has a named owner, canonical replacement and explicit removal conditions.
4. No new use or duplicate state authority is introduced while replacements converge.
5. Actual removal has parity, reachability, rollback and any required live-traffic/owner-approval evidence; retained unknowns are reported rather than concealed.

A necessary compatibility path can score well for containment while still remaining in the codebase. Do not confuse retirement readiness with a deletion quota.

## Quantitative inventory

Report counts and physical lines separately for reachable production source, tests, fixtures, generated output, tooling, historical archives and migrations. State file extensions, exclusions, scanner version and denominator. Physical lines include comments/blank lines unless explicitly counted otherwise; they are not a count of executable statements.

Use the REF-003 primary dispositions: canonical, confirmed_dead, compatibility_required, legacy_candidate, historical_archive, defensive_fallback, generated_or_fixture and unknown. A file may contain more than one behavioral region; classify at symbol/range level where necessary and do not claim the whole file is dead from one unused function.

Report structural flags separately: deep imports, persistence location, observer/fetch patches and oversized source/test files. Flags overlap and must not be summed as unique files or percent-dead. Legitimate read models, constructor `.from` calls, focus observers and image defaults must be characterized before being scored as violations.

For a claimed removal provide old path/range, exact removed lines, replacement/retirement evidence and merge SHA. Relocation to an archive is a move, not deleted functionality. A forward corrective migration can retire a runtime routine without deleting the historical migration file; historical SQL text is not live execution proof.

Use percentages only when numerator and denominator are measured with compatible scopes. For example, `confirmed-dead production physical lines / evaluated production physical lines`; label partial-scope results explicitly. Unknown external usage prevents a deletion-safe conclusion even when a static call graph is empty.

## Final report format

Each module row includes scope/SHA, the five dimension scores or NR, confidence with rationale, measured candidate/removal/retained counts, important exceptions, executed versus unrun checks, active blockers and next exact task. Keep repository, staging and production status in separate columns. The overall conclusion must state unresolved risk even when many individual scores improve. No automatic target of 9/10, 80–90% preservation or a fixed legacy-removal percentage is part of this program.
