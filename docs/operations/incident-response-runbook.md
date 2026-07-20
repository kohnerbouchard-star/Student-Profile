# Econovaria Incident Response Runbook

**Policy:** `docs/operations/incident-readiness-policy.json`  
**Roadmap item:** `OPS-INCIDENT-001`  
**Applies to:** development, isolated staging, production, and classroom operations  
**Time standard:** UTC for the incident record; local classroom time may be included as a secondary field

## 1. Operating principles

1. Protect player privacy, authorization boundaries, and economic integrity before availability.
2. Stop harmful writes before attempting broad recovery.
3. Keep safe reads available when containment permits.
4. Never infer that a timed-out or disconnected economic write failed. Verify authoritative state before retrying.
5. Use only reviewed, game-scoped, server-authoritative, idempotent correction routes or RPCs.
6. Preserve the append-only ledger. Corrections use compensating entries and immutable audit evidence.
7. Do not use direct production database edits as a normal correction path.
8. Keep credentials, tokens, token hashes, internal UUIDs, player names, and exploit details out of public issues and classroom messages.
9. Record decisions and evidence while the incident is occurring, not from memory afterward.
10. Restore normal economic writes only after the relevant invariants pass and the required approvers authorize recovery.

## 2. Severity model

The Incident Commander assigns the highest severity whose declaration condition is credibly met. Uncertainty is resolved upward until evidence permits a downgrade.

### P0 — Critical

Declare P0 when any of the following is confirmed or credibly suspected:

- cross-game data access or exposure;
- credential, service-secret, session-token, or token-hash exposure;
- authorization bypass or unauthorized economic mutation;
- unbounded, repeating, or destructive economic writes;
- irrecoverable data loss or inability to contain a destructive write path;
- compromise of production control or deployment authority.

Required immediate actions:

- acknowledge within 5 minutes;
- appoint an Incident Commander and Scribe;
- pause affected economic mutations immediately;
- revoke affected sessions or credentials;
- disable the affected route, feature, worker, or deployment when required;
- activate classroom read-only fallback;
- update the incident team every 15 minutes and stakeholders every 30 minutes until contained.

### P1 — High

Declare P1 for material integrity or availability impact without confirmed P0 scope, including:

- bounded economic corruption in one or more games;
- widespread inability to sign in or complete a required classroom workflow;
- runaway market, story, reward, or notification processing with contained scope;
- failure of Admin pause or correction controls;
- a material integrity risk with no confirmed cross-game or credential exposure.

Required immediate actions:

- acknowledge within 15 minutes;
- pause the affected capability or games;
- prevent retries that could duplicate writes;
- activate fallback for affected classrooms;
- update the incident team every 30 minutes and stakeholders every 60 minutes until contained.

### P2 — Moderate

Declare P2 for a major degraded workflow with a safe workaround, a bounded incorrect calculation, stale authoritative reads, or a partial outage without ongoing harmful writes.

Acknowledge within 60 minutes. Internal updates occur at least every 4 hours while active. Classroom or stakeholder updates are required when users are materially affected.

### P3 — Low

Declare P3 for localized presentation, reporting, or noncritical workflow defects with no security, privacy, integrity, or classroom-continuity impact.

Track through normal defect management. Acknowledge within one business day.

## 3. Incident roles and authority

Every P0 or P1 incident must explicitly assign the following roles. One person may hold multiple roles when staffing is limited, but the Incident Commander may not be the sole approver of a P0/P1 economic correction or return to normal writes.

### Incident Commander

Accountable for severity, declaration, containment decisions, role assignment, decision logging, recovery authorization, stakeholder posture, and closure.

### Technical Lead

Owns technical investigation, causal analysis, mitigation implementation, verification design, and code or configuration evidence.

### Data Integrity Lead

Owns affected-record determination, economic reconciliation, correction manifests, before-and-after balance proofs, duplicate detection, and post-correction verification.

### Operations Lead

Owns environment control, deployment containment, feature or worker disablement, session and credential response, rollback execution, and operational evidence.

### Classroom Lead

Owns teacher instructions, fallback activation, offline record custody, safe classroom continuity, and return-to-service instructions.

### Communications Lead

Owns internal, classroom, stakeholder, and status updates. Reviews every external message for privacy, security, and accuracy.

### Scribe

Maintains the UTC timeline, decision log, action log, evidence index, role handoffs, unresolved questions, and correction references.

## 4. Declaration and incident record

Create a private incident record before placing sensitive detail anywhere else. The public repository issue form is a redacted coordination shell only.

The incident record must include:

- incident ID in `INC-YYYYMMDD-NNN` format;
- detected-at time and declared-at time in UTC;
- initial and current severity;
- affected environments and capabilities;
- affected game count and approximate player count;
- whether security, privacy, economic integrity, availability, or classroom continuity is involved;
- assigned roles and contact path;
- current containment state;
- links to private logs, traces, deployment records, and correction manifests;
- next update time;
- explicit unknowns.

Never copy credentials, access codes, player names, internal UUIDs, raw authorization headers, session tokens, service-role keys, or exploit payloads into a public issue.

## 5. Response lifecycle

### 5.1 Detect and validate

- Confirm the signal using at least one authoritative source: server log, audit record, database invariant, deployment evidence, or reproducible request.
- Distinguish stale UI or cache behavior from authoritative state.
- Record the first known bad time and last known good time.
- Preserve the original alert, report, screenshot, or request ID.
- Do not repeatedly reproduce a suspected destructive write in production.

### 5.2 Declare and assign

- Assign severity using Section 2.
- Name the Incident Commander and Scribe immediately.
- Assign remaining roles before investigation expands.
- State the initial impact hypothesis and confidence level.
- Set the next update time.

### 5.3 Contain

Apply the narrowest control that reliably stops harm. Escalate immediately when the narrow control is uncertain.

Containment order:

1. stop or pause the affected economic mutation;
2. pause the affected game when capability-level containment is insufficient;
3. preserve safe reads where possible;
4. revoke affected Player or Admin sessions;
5. rotate exposed credentials through approved secret-management paths;
6. disable or roll back the affected route, worker, function, or release;
7. isolate the affected environment or traffic path;
8. activate classroom fallback.

For market, story, reward, Store, Contract, Inventory, Attendance, Banking, or Marketplace incidents, the Incident Commander must explicitly decide whether global game mutation pause is required.

### 5.4 Preserve evidence

Capture evidence before destructive cleanup when doing so does not prolong harm:

- release commit SHA and artifact hashes;
- deployed function and frontend versions;
- configuration and feature-flag versions;
- migration head and applied migration ledger;
- bounded request IDs and sanitized actor/game identifiers;
- relevant audit, ledger, transition, and idempotency records;
- before-and-after query outputs;
- timestamps and time zone;
- exact containment commands or approved control actions.

Evidence must be access-controlled, time-stamped, and referenced from the private incident record. Public artifacts must be sanitized.

### 5.5 Investigate

The Technical Lead and Data Integrity Lead maintain separate but linked hypotheses:

- technical cause: code, configuration, deployment, environment, dependency, authorization, concurrency, or operator path;
- data impact: affected games, players, records, currencies, quantities, balances, state transitions, and time range.

For every hypothesis record:

- supporting evidence;
- contradicting evidence;
- confidence;
- next discriminating check;
- whether the check is safe in production.

### 5.6 Recover service

Recovery is not the same as correction. Service may return in a restricted read-only mode while data reconciliation remains active.

Before restoring a capability:

- the harmful path is disabled, fixed, or rolled back;
- authorization and cross-game tests pass where relevant;
- replay and idempotency tests pass for economic writes;
- the affected environment reports the intended release/configuration;
- the Incident Commander records the recovery decision;
- P0/P1 return to normal economic writes has two-person approval.

### 5.7 Correct and reconcile

Follow `docs/operations/classroom-continuity-and-economic-correction.md`.

No P0/P1 economic correction may be executed without:

- a bounded correction manifest;
- an affected-record query and expected count;
- dry-run or isolated-staging proof when technically possible;
- a reviewed authoritative route or RPC;
- stable idempotency keys;
- two-person approval;
- exact post-write invariant verification.

### 5.8 Validate

Validation must cover the incident’s failure mode, not only generic health checks.

Minimum validation for security or integrity incidents:

- wrong-role and wrong-game denial;
- revoked and expired session denial;
- duplicate and conflicting idempotency-key behavior;
- exact ledger, inventory, holding, reward, or state-transition counts;
- read projection equals authoritative write history;
- affected and unaffected game comparisons;
- no credentials, tokens, or internal UUIDs in browser output, logs, or error envelopes;
- application restart or session replacement behavior when relevant.

### 5.9 Communicate recovery

Use the templates in `docs/operations/incident-communications-templates.md`.

A recovery message must state:

- what users may safely do now;
- what remains restricted;
- whether previously submitted actions should be retried;
- whether classroom fallback records will be reconciled;
- when the next update will occur;
- where questions should be directed.

Do not state that no data was affected until the Data Integrity Lead has completed the impact assessment.

### 5.10 Close

The Incident Commander may close the active response only when:

- containment remains effective;
- root cause or a bounded causal hypothesis is recorded;
- authoritative state and relevant invariants pass;
- affected classrooms receive return-to-service instructions;
- temporary access, bypasses, and mitigations are removed or explicitly time-bounded;
- corrective actions have owners and due dates;
- a post-incident review is scheduled for every P0 and P1.

## 6. Handoffs

A handoff must include:

- current severity and rationale;
- active containment controls;
- current impact estimate;
- completed and pending actions;
- next update deadline;
- links to evidence and private records;
- explicit approval authority;
- risks of changing or removing current controls.

The outgoing role holder remains accountable until the receiving person confirms the handoff in the incident record.

## 7. Communication rules

- Use one source of truth for incident status.
- Separate confirmed facts, working hypotheses, and unknowns.
- Use absolute timestamps with time zone.
- Do not identify individual students or teachers in broad communications.
- Do not publish game/session codes, Player IDs, access codes, internal UUIDs, tokens, secret names paired with values, or exploitable request detail.
- Avoid speculative root-cause claims.
- State when retries are unsafe.
- State when the game is read-only, paused, or ended.
- Record every material external message in the incident timeline.

## 8. Post-incident review

Every P0 and P1 receives a blameless review. P2 receives a review when the Incident Commander or product owner determines that recurrence risk, integrity impact, or operational learning warrants it.

The review must include:

- executive summary;
- customer and classroom impact;
- UTC timeline;
- detection and response analysis;
- technical root cause and contributing conditions;
- data-integrity assessment and correction evidence;
- what worked and what failed;
- why existing tests, controls, or monitoring did not prevent or detect the issue sooner;
- corrective and preventive actions with owners, priority, and due dates;
- verification evidence for completed actions;
- roadmap updates.

Corrective actions are not complete because code was written. They close only when the required test, environment, migration, operational, or classroom evidence exists.

## 9. Required incident artifacts

For P0/P1 retain:

- private incident record;
- sanitized public coordination issue when used;
- timeline and decision log;
- evidence index;
- impact query and affected-record list;
- correction manifest and approvals;
- before-and-after invariant evidence;
- communication archive;
- post-incident review;
- corrective-action tracker.

For P2/P3 retain the artifacts proportionate to impact, but always retain the incident ID, severity, owner, impact, resolution, and verification evidence.

## 10. Return-to-service checklist

- [ ] Harmful write path is contained.
- [ ] Active release and configuration are identified.
- [ ] Authorization and game isolation pass.
- [ ] Retry and idempotency behavior pass.
- [ ] Economic invariants pass.
- [ ] Classroom fallback records are secured and assigned for reconciliation.
- [ ] Temporary credentials or access are rotated or removed.
- [ ] P0/P1 two-person approval is recorded.
- [ ] Teachers and stakeholders have safe retry instructions.
- [ ] Next monitoring checkpoint is assigned.
- [ ] Incident record contains closure evidence.
