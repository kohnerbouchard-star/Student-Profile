# Meridian Corridor Cancellation and Supersession Matrix

Stable content ID: `policy.story-arc.meridian-cancellation.v1`
Content type: lifecycle policy
Version: 1.0.0-draft
Maturity: draft
Applies to: `story-arc.global.meridian-corridor.v1`
Implementation status: manual-compatible specification; backend lifecycle mapping pending

## Purpose

Define what happens to events, interactions, Contracts, submissions, rewards, scheduled effects, notifications, and follow-up content when the Meridian arc is cancelled, paused, superseded, or corrected at each stage.

## Governing rules

1. Cancellation does not delete financial, submission, inventory, decision, or audit history.
2. Unapplied future effects may be cancelled.
3. Applied authoritative transactions require reversal through an approved compensating path, not deletion.
4. Accepted Contract work receives the policy declared before acceptance.
5. Rewards already issued remain unless a separate authorized correction policy applies.
6. Unopened interactions may close silently in the interface but remain traceable in content audit.
7. Delivered notifications remain in history with a cancellation or correction notice where materially necessary.
8. A superseded arc preserves prior player reasoning and identifies which assumptions changed.

## Lifecycle actions

### Close

Prevent new access while preserving prior records.

### Cancel

End a pending item without treating it as completed or failed.

### Preserve

Keep the record and ordinary lifecycle unchanged.

### Convert

Move an accepted or submitted item into a defined replacement or reflection form.

### Supersede

Mark an item as replaced by a later arc, event, or decision while preserving history.

### Reverse by compensation

Apply an explicit authoritative compensating transaction or effect. Never edit or delete settled history.

## Stage 0: Available but not introduced

Cancellation behavior:

- arc availability: close;
- events: none applied;
- interactions: close unopened invitations;
- Contracts: remove availability; no accepted work expected;
- notifications: none required unless availability was previously announced;
- economic effects: none;
- resolution: none;
- follow-up: none.

Player-facing explanation:

Optional. Required only if players could already see the upcoming scenario.

## Stage 1: Forum announced

Cancellation behavior:

- Forum announcement: preserve as historical announcement;
- unopened invitation interactions: close;
- delivered invitation responses: preserve;
- `evaluate-corridor` unaccepted: close;
- accepted but unsubmitted introductory Contract: apply configured grace or cancel without penalty;
- submitted Contract: preserve review eligibility unless instructor policy explicitly converts it to a general infrastructure analysis;
- approved Contract and reward: preserve;
- country briefings: preserve as reference content;
- future model interactions: do not open;
- economic effects: cancel any unapplied trace sentiment effects;
- notification: issue cancellation reason.

## Stage 2: Competing models

Cancellation behavior:

- model briefings: preserve;
- recommendation interactions: close if unopened; preserve submitted responses;
- `country-exposure` and `financing-governance`:
  - unaccepted: close;
  - accepted: grace or convert to a comparative-policy assignment;
  - submitted: review under original rubric unless facts are materially invalidated;
  - approved: preserve reward and evidence;
- recorded country positions: preserve as historical recommendations, not active commitments;
- financing offers: mark withdrawn or expired; create no debt or ownership;
- scheduled capacity warnings: cancel if not activated;
- economic effects: no new Corridor construction or finance effects.

## Stage 3: Capacity warnings active

Cancellation behavior:

- source warnings: preserve if the real condition remains independently valid;
- warning created only for the Corridor scenario: close or convert to a country-development event with explicit rationale;
- country response interactions: close unopened; preserve submitted responses;
- disruption Contracts:
  - if tied to an active real country condition, preserve;
  - if tied only to a cancelled Corridor commitment, convert to reflection or cancel under grace policy;
- applied country-stat effects:
  - preserve when caused by the underlying condition;
  - schedule recovery when caused solely by Corridor expectations;
- market effects: expire or recover according to the underlying event, never delete price history;
- route, energy, resource, or labor commitments: mark not finalized unless an authorized independent agreement exists.

## Stage 4: Customs security intrusion active

Ordinary cancellation is not sufficient while record integrity remains unresolved.

Required behavior:

- security event: continue until containment, resolution, or authorized supersession;
- Meridian construction and governance decisions: pause;
- security interaction: remain open until published deadline or authorized emergency decision;
- no-response default: remain as declared;
- crisis-response Contract: preserve if accepted; close new acceptance when the decision window ends;
- applied security, confidence, trade, and market effects: remain until recovery rules apply;
- access grants: retain scope and expiry; cancellation of the wider Corridor does not silently broaden or extend access;
- cargo and payment reconciliation: continue through authoritative operations;
- news: explain that project cancellation and incident resolution are separate matters.

## Stage 5: Emergency response selected

Cancellation behavior:

- selected security response: continue through its defined containment and expiry lifecycle;
- permanent Corridor operating decisions: cancel or pause;
- temporary access: expire according to recorded terms;
- audit and correction: continue;
- manual verification or suspension: continue until restart or closure conditions are met;
- submitted player recommendations: preserve;
- no retroactive reinterpretation of the selected emergency response.

## Stage 6: Resolution calculated but not announced

Cancellation or correction behavior:

- freeze new player decisions;
- verify evidence and hard blockers;
- if evidence is incomplete, return to the prior stage rather than announce a fabricated outcome;
- if an instructor override is used, mark sandbox or override status;
- do not issue terminal rewards or follow-up unlocks until resolution record succeeds;
- cancel duplicate or stale resolution attempts using idempotency key;
- preserve the draft calculation in Admin audit if policy permits.

## Stage 7: Terminal resolution announced

Cancellation becomes a rollback or supersession process.

Required behavior:

- terminal resolution: preserve original record;
- correction: create revised resolution with reason and authorized actor;
- follow-up arcs: cancel or replace explicitly;
- Contract chain completion and rewards: preserve if validly issued;
- unissued rewards: follow corrected eligibility without duplicate payment;
- market and economic effects: reverse only through scheduled recovery or compensating event;
- country and institution positions: preserve historically;
- player-facing news: issue correction or supersession notice linked to original outcome;
- Admin audit: show old and new resolution, decisive condition, and affected follow-up content.

## Accepted Contract policy matrix

| Contract state | Before deadline cancellation | After decision supersession | After terminal resolution correction |
|---|---|---|---|
| Available, not accepted | Close | Close | Close or replace |
| Accepted, not submitted | Grace or cancel without penalty | Convert or grace | Usually close; instructor may allow reflection |
| Submitted, pending review | Preserve review if prompt remains valid | Review original reasoning or convert transparently | Preserve original evidence; do not require fabricated retroactive alignment |
| Changes requested | Preserve revision window when facts remain valid | Provide revised prompt or close without penalty | Preserve prior history; one reward maximum |
| Approved, reward pending | Complete authoritative reward if approval remains valid | Complete once or cancel only through explicit policy | Do not duplicate; correction cannot silently revoke settled reward |
| Approved, reward issued | Preserve | Preserve | Preserve unless separate compensating correction is authorized |
| Expired | Preserve expired state | Preserve | Preserve |

## Interaction policy matrix

| Interaction state | Cancellation treatment |
|---|---|
| Not delivered | Close |
| Delivered, no response | Mark closed or cancelled; do not infer a response |
| Responded | Preserve response and immediate reply |
| Expired | Preserve expiry and published default behavior |
| Converted to Contract | Follow Contract lifecycle |
| Economic effect scheduled but unapplied | Cancel |
| Economic effect applied | Recover or compensate; do not delete |

## Notification policy

Issue a cancellation or supersession notice when:

- players had an active deadline;
- an accepted Contract changed;
- an announced event or outcome changed;
- an emergency response remains active after the wider arc ends;
- a reward or unlock is affected;
- the reason materially changes player interpretation.

Do not notify players about internal preflight records that were never visible.

## Validation

- stage known before cancellation;
- authorized actor recorded;
- reason required;
- no ledger or market history deletion;
- no duplicate reward or chain completion;
- accepted-work policy matches preannounced scenario rule;
- access expiry remains intact;
- event recovery preserves source history;
- notifications link to original content where relevant;
- correction and cancellation are distinguishable;
- all effects and records remain session scoped.

## Review status

- narrative review: ready for re-review
- gameplay review: grace and student fairness specified
- economic review: compensation and recovery mapping pending
- technical review: lifecycle route and idempotency mapping pending