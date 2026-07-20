# Classroom Continuity and Economic Correction

**Related policy:** `docs/operations/incident-readiness-policy.json`  
**Related runbook:** `docs/operations/incident-response-runbook.md`  
**Roadmap item:** `OPS-INCIDENT-001`

## 1. Purpose

This procedure keeps a classroom functioning during an Econovaria incident without creating duplicate, unverifiable, or unauthorized economic outcomes. It also defines the only acceptable repository-operational process for correcting affected game state after containment.

## 2. Fallback activation

The Incident Commander or Classroom Lead activates fallback when any of the following applies:

- the game or an economic capability is intentionally paused for containment;
- the service is unavailable or repeatedly timing out;
- a write outcome is ambiguous and authoritative state cannot yet be verified;
- an authorization, privacy, or cross-game concern is under investigation;
- normal operation could create duplicate rewards, purchases, trades, transfers, redemptions, or story effects.

The fallback notice must identify:

- affected game or class using a nonsecret classroom label;
- start time in local time and UTC;
- capabilities that are read-only, paused, or unavailable;
- whether students must stop retrying submitted actions;
- the approved offline activity;
- the person responsible for custody of offline records;
- the next update time.

## 3. Universal classroom rules

While fallback is active:

1. Do not ask students to repeatedly submit a failed or timed-out action.
2. Do not issue replacement game codes, Player IDs, or Access Codes through public classroom channels.
3. Do not manually edit balances, inventory, holdings, rewards, attendance outcomes, or Contract state in the database.
4. Do not promise that a reward, purchase, trade, or redemption failed until authoritative state is checked.
5. Do not create informal IOUs, handwritten balances, or ad hoc stock prices that bypass reconciliation.
6. Keep safe read-only screens available when containment permits.
7. Record offline activity on the approved continuity log.
8. Keep one custodian for the authoritative offline log and one backup reviewer.
9. Use a stable local record ID for every offline entry so it can be reconciled once.
10. Resume normal writes only after an explicit return-to-service notice.

## 4. Approved continuity log

The continuity log may be paper or an access-controlled local document. It must not contain Access Codes, session tokens, secret values, internal UUIDs, or unnecessary personal data.

Required fields:

- local record ID, for example `OFF-20260720-001`;
- classroom or game label;
- local date and time with time zone;
- student-facing Player ID or roster label only when needed;
- activity type;
- objective evidence or teacher confirmation;
- intended outcome, not a manually changed balance;
- recorder name or role;
- reviewer name or role;
- reconciliation status: pending, matched-existing, applied-once, rejected, or needs-review;
- authoritative transaction, audit, or correction reference after reconciliation.

## 5. Capability-specific fallback

### 5.1 Authentication and sessions

- Stop distributing or resetting credentials unless the Incident Commander confirms that credential issuance is safe.
- Never collect Access Codes in a shared spreadsheet, chat, projected screen, or public issue.
- Use non-digital lesson activities until sign-in is restored.
- A session-expiry event returns the user to sign-in; it is not evidence that the preceding write failed.

### 5.2 Attendance

- Record presence, lateness, absence, and excused status on the continuity log.
- Record the observed scan or roll-call time and the intended attendance status.
- Do not calculate or promise the final local-currency reward manually.
- On recovery, reconcile through the authoritative Attendance correction or reward-adjustment path using stable idempotency references derived from the offline record ID.
- Verify that exactly one attendance outcome and at most one intended reward ledger effect exists.

### 5.3 Contracts

- Students may continue non-digital Contract work when instructions are already known.
- Preserve drafts locally; do not repeatedly submit while outcome is ambiguous.
- Teachers record receipt time and evidence description on the continuity log.
- Do not approve rewards outside the authoritative Contract lifecycle.
- On recovery, match an existing submission before creating one, then use normal revision, approval, and idempotent reward paths.

### 5.4 Store and purchasing

- Freeze new quotes and purchases when Store integrity or connectivity is uncertain.
- Do not reserve stock manually or accept cash outside the authoritative Store flow.
- A student may record purchase intent, but intent does not create ownership or price protection.
- On recovery, request a new authoritative quote unless the existing transaction is confirmed committed.
- Verify one ledger debit, one inventory credit, and one receipt for each completed purchase.

### 5.5 Inventory and redemption

- Safe inventory reads may remain visible, but new redemption requests stop when reservation or fulfillment integrity is uncertain.
- Do not hand out real-world rewards without a confirmed authoritative redemption state and staff procedure.
- Record any unavoidable physical handoff with the offline record ID, item, quantity, recipient-facing identifier, staff witnesses, and time.
- Reconcile through the normal approve, reject, or fulfill transition; never consume inventory twice.

### 5.6 Market and portfolio

- Freeze buy, sell, watchlist mutation, and scheduled market ticks when price or settlement integrity is uncertain.
- Do not invent substitute prices, execute paper trades for later guaranteed entry, or adjust holdings manually.
- Students may perform analysis exercises using the last clearly labeled historical snapshot, but those exercises are not executable orders.
- On recovery, verify whether each ambiguous order committed before retrying with the same idempotency key.
- Validate one cash settlement, one holding change, one trade record, and correct realized/unrealized values.

### 5.7 Banking and ledger

- Keep ledger and balance views read-only when safe.
- Stop Admin adjustments, transfers, savings actions, interest jobs, and loan actions when ledger integrity is uncertain.
- Never delete or rewrite ledger entries.
- Corrections use compensating entries through a reviewed idempotent route or RPC.
- Verify the account-balance projection against append-only ledger history after correction.

### 5.8 Story, notifications, and scheduled jobs

- Pause the affected runner, scheduler, or game mutations when replay could duplicate effects.
- Do not manually advance story flags, rewards, Contracts, scarcity, or market shocks in production.
- Preserve the last known event, delivery, and idempotency references.
- On recovery, prove replay-safe execution and exactly-once downstream effects before resuming schedules.

### 5.9 Marketplace, crafting, business, loans, and future systems

- Treat any unsupported or not-yet-authoritative surface as unavailable, not as a manual workflow.
- For implemented systems, freeze listing, reservation, consumption, settlement, production, hiring, repayment, or claim writes when their invariant is uncertain.
- Do not create manual substitutions for reserved inventory, cash, ownership, or progression.

## 6. Economic correction principles

Every correction must be:

- game-scoped;
- server-authoritative;
- idempotent;
- append-only or compensating;
- auditable;
- reconcilable to the original incident and offline record;
- approved at the required severity level.

The correction process must preserve the distinction between:

- an original valid transaction;
- a duplicate or invalid transaction;
- a compensating correction;
- a teacher-approved offline outcome;
- a rejected or unverifiable claim.

## 7. Correction manifest

Before executing a P0 or P1 correction, create an access-controlled correction manifest containing:

- incident ID;
- manifest version and immutable content hash;
- affected environment and release SHA;
- affected games and bounded time range;
- source query or evidence reference;
- expected affected-record count;
- correction type and authoritative route or RPC;
- stable idempotency key for every correction operation;
- expected ledger, inventory, holding, reward, and state-transition deltas;
- dry-run or isolated-staging evidence when technically possible;
- first approver and second approver;
- operator;
- execution start and end time;
- result reference for each operation;
- post-correction verification results;
- unresolved exceptions.

Do not place credentials, tokens, raw student names, Access Codes, or internal UUIDs in a public correction manifest.

## 8. Correction workflow

### Step 1 — Bound the impact

- Identify first known bad and last known good times.
- Query by environment, game, capability, request ID, idempotency key, audit type, and time range.
- Compare affected games with an unaffected control game where possible.
- Record exact counts before proposing writes.

### Step 2 — Classify records

Classify every candidate as:

- valid-existing;
- duplicate;
- missing-expected;
- incorrect-amount-or-state;
- ambiguous-needs-review;
- unrelated.

No ambiguous record is corrected automatically without an approved deterministic rule.

### Step 3 — Design the correction

- Prefer an existing reviewed Admin or Classroom route or RPC.
- Add a migration or reviewed correction RPC when no safe authority exists.
- Use compensating ledger entries rather than modifying history.
- Use explicit reason codes and link the incident ID.
- Ensure repeated execution returns the same desired state without repeated effects.

### Step 4 — Prove before execution

For P0/P1:

- run the affected query twice and confirm stable counts;
- verify the correction against a fixture or isolated staging when possible;
- test duplicate request replay and conflicting idempotency-key reuse;
- test wrong-game and wrong-role denial;
- verify no unrelated game changes;
- obtain two-person approval.

### Step 5 — Execute in bounded batches

- Use small, count-limited batches.
- Record each request ID, idempotency key, result, and timestamp.
- Stop immediately when observed counts differ from the manifest.
- Never improvise a new correction rule during execution; revise and reapprove the manifest.

### Step 6 — Verify invariants

Applicable checks include:

- exactly one Attendance reward for one qualifying attendance event;
- exactly one Contract cash or item reward for one approved completion;
- one Store debit, one inventory credit, and one receipt per purchase;
- reserved plus available quantity does not exceed owned quantity;
- one market cash settlement and one holding/trade effect per order;
- no negative holdings from long-only trading;
- account-balance projection equals append-only ledger sum by currency;
- no cross-game writes;
- no invalid lifecycle transition;
- repeated correction execution produces zero additional effect.

### Step 7 — Reconcile classroom records

For each offline record ID:

- search for an already committed authoritative outcome;
- mark `matched-existing` when the intended outcome already exists;
- apply once when missing and approved;
- mark `rejected` with reason when evidence is insufficient or the outcome is not allowed;
- record the authoritative transaction or audit reference;
- obtain reviewer sign-off;
- inform the teacher when reconciliation is complete.

### Step 8 — Close access and retain evidence

- Remove temporary correction permissions.
- Rotate temporary credentials when used.
- Store the final manifest and verification evidence under approved retention controls.
- Add follow-up actions for missing automated checks, observability, or safer correction tooling.

## 9. Return-to-classroom procedure

The Classroom Lead sends a return-to-service notice only after the Incident Commander approves recovery.

The notice must state:

- which capabilities are restored;
- which capabilities remain read-only or unavailable;
- whether students should retry any prior action;
- whether offline attendance or Contract records have been reconciled;
- how students report a missing or duplicated outcome without sharing credentials;
- the monitoring window and next update time.

Teachers should begin with a low-risk read verification, then one bounded test action approved by the incident team before normal class-wide writes resume after a P0/P1 incident.

## 10. Continuity checklist

- [ ] Fallback start time and affected scope recorded.
- [ ] Students told whether retries are unsafe.
- [ ] Economic writes paused where required.
- [ ] Safe read-only access decision recorded.
- [ ] Offline log custodian and reviewer assigned.
- [ ] No credentials or internal identifiers collected.
- [ ] Every offline record has a stable local ID.
- [ ] Correction manifest approved when required.
- [ ] Existing authoritative outcomes checked before correction.
- [ ] Corrections used idempotent authoritative paths.
- [ ] Economic and cross-game invariants passed.
- [ ] Offline records reconciled exactly once.
- [ ] Return-to-service notice sent.
- [ ] Temporary access removed.
