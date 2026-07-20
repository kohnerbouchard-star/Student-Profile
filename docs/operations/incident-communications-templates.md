# Incident Communications Templates

**Related runbook:** `docs/operations/incident-response-runbook.md`  
**Roadmap item:** `OPS-INCIDENT-001`

## 1. Communication rules

Before sending any incident message:

- separate confirmed facts, working hypotheses, and unknowns;
- use absolute timestamps with time zone;
- state whether retries are safe;
- state whether the game or capability is read-only, paused, or unavailable;
- provide the next update time;
- use nonsecret classroom or game labels;
- omit student names, Access Codes, Player credentials, session tokens, internal UUIDs, service secrets, exploit payloads, and unnecessary technical detail;
- do not claim that no data was affected until the Data Integrity Lead has completed the impact assessment;
- do not claim that a timed-out economic write failed until authoritative state has been checked.

## 2. Internal incident declaration

```text
[INCIDENT DECLARED] [INCIDENT ID] — [P0/P1/P2/P3]

Declared: [YYYY-MM-DD HH:MM UTC]
Incident Commander: [NAME/ROLE]
Affected environment(s): [DEVELOPMENT / ISOLATED STAGING / PRODUCTION]
Affected capability or workflow: [CAPABILITY]
Current impact: [CONFIRMED USER, CLASSROOM, SECURITY, PRIVACY, INTEGRITY, OR AVAILABILITY IMPACT]
Current containment: [PAUSED / DISABLED / READ-ONLY / INVESTIGATING]
Retry guidance: [DO NOT RETRY / SAFE TO RETRY / AWAIT VERIFICATION]
Confirmed facts:
- [FACT]
Working hypotheses:
- [HYPOTHESIS AND CONFIDENCE]
Unknowns:
- [UNKNOWN]
Next actions:
- [ACTION — OWNER]
Next update: [YYYY-MM-DD HH:MM UTC]
Private incident record: [ACCESS-CONTROLLED REFERENCE]
```

## 3. Incident role assignment

```text
[INCIDENT ID] role assignment — [YYYY-MM-DD HH:MM UTC]

Incident Commander: [NAME/ROLE]
Technical Lead: [NAME/ROLE]
Data Integrity Lead: [NAME/ROLE]
Operations Lead: [NAME/ROLE]
Classroom Lead: [NAME/ROLE]
Communications Lead: [NAME/ROLE]
Scribe: [NAME/ROLE]

Decision authority and constraints:
- [CURRENT CONTAINMENT AUTHORITY]
- [TWO-PERSON APPROVAL REQUIREMENTS]
- [NEXT HANDOFF TIME, IF APPLICABLE]
```

## 4. Classroom read-only or pause notice

```text
Econovaria classroom notice — [LOCAL DATE AND TIME WITH TIME ZONE]

We have temporarily placed [GAME OR CAPABILITY LABEL] in [READ-ONLY / PAUSED / UNAVAILABLE] mode while we verify a system issue.

What students should do now:
- [APPROVED OFFLINE OR READ-ONLY ACTIVITY]
- Do not repeatedly retry purchases, trades, rewards, submissions, redemptions, or other actions that may have already been received.
- Do not share Player IDs, Access Codes, or screenshots containing credentials.

What teachers should record:
- [ATTENDANCE / CONTRACT RECEIPT / OTHER APPROVED CONTINUITY RECORD]
- Use the approved offline record ID and continuity log.

We will reconcile approved offline records after the system is verified. Do not create manual balances, inventory, stock holdings, or rewards.

Next update: [LOCAL DATE AND TIME WITH TIME ZONE]
Questions: [APPROVED SUPPORT CHANNEL]
```

## 5. Teacher operational instructions

```text
[INCIDENT ID] teacher instructions — [LOCAL DATE AND TIME WITH TIME ZONE]

Affected class/game: [NONSECRET LABEL]
Current mode: [READ-ONLY / PAUSED / OFFLINE FALLBACK]
Affected workflows: [LIST]
Safe workflows: [LIST]
Unsafe retries: [LIST]

Continuity procedure:
1. [STEP]
2. [STEP]
3. Record each approved offline outcome using a stable local record ID.
4. Do not record Access Codes, tokens, internal UUIDs, or unnecessary personal data.
5. Submit the continuity log to [CUSTODIAN] through [ACCESS-CONTROLLED CHANNEL].

Do not promise students that an ambiguous action failed or that a reward will be manually added. The incident team will verify authoritative state and reconcile approved outcomes exactly once.

Next update: [DATE AND TIME]
```

## 6. Stakeholder status update

```text
[INCIDENT ID] status update — [P0/P1/P2/P3] — [YYYY-MM-DD HH:MM UTC]

Status: [INVESTIGATING / CONTAINED / RECOVERING / MONITORING]
Impact: [BOUNDED SUMMARY]
Affected scope: [ENVIRONMENTS, CAPABILITIES, APPROXIMATE GAMES/CLASSROOMS]
Security/privacy status: [CONFIRMED / NOT CONFIRMED / UNDER ASSESSMENT]
Economic-integrity status: [CONFIRMED / NOT CONFIRMED / UNDER RECONCILIATION]
Containment completed:
- [ACTION]
Recovery work:
- [ACTION]
User guidance: [DO NOT RETRY / READ-ONLY / SAFE TO RETRY SPECIFIC ACTIONS]
Current unknowns:
- [UNKNOWN]
Next update: [YYYY-MM-DD HH:MM UTC]
```

## 7. Ambiguous-write notice

```text
We received a report that [ACTION TYPE] did not return a clear result at [DATE AND TIME].

Do not submit the same action again with a new request until the incident team verifies the authoritative outcome. A timeout or lost connection does not prove that the action failed.

Current guidance: [WAIT / USE READ-ONLY VIEW / CONTACT TEACHER]
Verification reference: [SANITIZED REQUEST OR OFFLINE RECORD REFERENCE]
Next update: [DATE AND TIME]
```

## 8. Containment update

```text
[INCIDENT ID] containment update — [YYYY-MM-DD HH:MM UTC]

The harmful or uncertain path is currently contained through: [PAUSE / DISABLE / ROLLBACK / SESSION REVOCATION / CREDENTIAL ROTATION / TRAFFIC ISOLATION].

Current safe mode: [READ-ONLY / BOUNDED FEATURE AVAILABILITY / FULL PAUSE]
Confirmed impact so far: [SUMMARY]
Data assessment: [IN PROGRESS / COMPLETE]
Correction status: [NOT REQUIRED / DESIGNING / APPROVED / EXECUTING / VERIFYING]
Retry guidance: [GUIDANCE]
Next update: [YYYY-MM-DD HH:MM UTC]
```

## 9. Correction approval request

```text
[INCIDENT ID] economic correction approval request

Manifest version/hash: [VERSION / SHA-256]
Affected environment: [ENVIRONMENT]
Affected games/time range: [BOUNDED SCOPE]
Expected record count: [COUNT]
Correction authority: [REVIEWED ROUTE OR RPC]
Correction type: [COMPENSATING LEDGER / INVENTORY / HOLDING / STATE TRANSITION / OTHER]
Idempotency design: [SUMMARY]
Dry-run or isolated-staging evidence: [REFERENCE]
Wrong-game and replay verification: [REFERENCE]
Expected invariant changes: [SUMMARY]
Abort criteria: [CRITERIA]
Operator: [NAME/ROLE]
First approver: [NAME/ROLE]
Second approver: [NAME/ROLE]

Approval means the manifest is bounded and technically safe. It does not authorize deviation from the manifest during execution.
```

## 10. Recovery notice

```text
Econovaria service update — [LOCAL DATE AND TIME WITH TIME ZONE]

[GAME OR CAPABILITY LABEL] is now [RESTORED / RESTORED WITH RESTRICTIONS].

Safe actions:
- [LIST]

Actions still restricted:
- [LIST]

Retry guidance:
- [SPECIFIC PRIOR ACTIONS THAT MUST NOT BE RETRIED]
- [SPECIFIC ACTIONS THAT MAY NOW BE RETRIED]

Offline records:
- [RECONCILED / BEING RECONCILED / NOT APPLICABLE]
- Report a missing or duplicated outcome through [APPROVED CHANNEL] without sharing credentials.

We are monitoring the service through [DATE AND TIME].
Next update: [DATE AND TIME / FINAL UPDATE]
```

## 11. Correction completion notice

```text
[INCIDENT ID] correction verification complete — [YYYY-MM-DD HH:MM UTC]

Correction manifest: [VERSION / HASH / ACCESS-CONTROLLED REFERENCE]
Executed operations: [COUNT]
Matched existing outcomes: [COUNT]
Applied compensating or missing outcomes: [COUNT]
Rejected or unresolved records: [COUNT]
Replay result: zero additional effects on repeated verification
Cross-game verification: passed
Authoritative invariant verification: [PASSED / EXCEPTIONS LISTED]
Temporary access removed: [YES / PENDING]
Classroom reconciliation status: [COMPLETE / REMAINING COUNT]
Approvers: [ROLES]
```

## 12. Incident resolved and monitoring

```text
[INCIDENT ID] resolved — monitoring active

Resolved at: [YYYY-MM-DD HH:MM UTC]
Final severity: [P0/P1/P2/P3]
User impact: [CONFIRMED SUMMARY]
Security/privacy impact: [CONFIRMED SUMMARY]
Economic-integrity impact: [CONFIRMED SUMMARY]
Resolution: [BOUNDED DESCRIPTION]
Correction status: [COMPLETE / NOT REQUIRED / FOLLOW-UP ACTIVE]
Monitoring window: [START–END]
Known restrictions: [NONE / LIST]
Post-incident review: [DATE OR NOT REQUIRED]
Corrective-action tracker: [REFERENCE]
```

## 13. Post-incident review invitation

```text
[INCIDENT ID] post-incident review

Date/time: [DATE AND TIME WITH TIME ZONE]
Facilitator: [NAME/ROLE]
Required participants: [ROLES]
Pre-read: [ACCESS-CONTROLLED REFERENCE]

Review objectives:
- establish a shared factual timeline;
- understand technical and operational contributing conditions;
- evaluate detection, containment, classroom continuity, correction, and communication;
- define corrective actions with owners, priority, due dates, and verification evidence.

This is a blameless review. The focus is on system conditions, decisions, safeguards, and learning.
```

## 14. Public issue redaction note

```text
This issue is a sanitized coordination record. Do not add credentials, tokens, Access Codes, Player names, internal UUIDs, secret values, private logs, exploit payloads, or links that grant unauthorized access. Place sensitive evidence only in the approved private incident record.
```
