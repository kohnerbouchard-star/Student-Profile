# Story Character Reply Engine V1

## Purpose

Story-character message threads are real two-way conversations. A successful player reply is durably queued, interpreted through a bounded classroom-safe intent/topic model, answered in the character's country-specific voice, delivered through the canonical Messaging subsystem, and recorded in player-scoped relationship memory.

This engine does not create a second messaging system and does not expose player ownership UUIDs to the browser.

## Canonical flow

1. A player sends a message through the existing Player Messaging API.
2. `send_player_message_atomic_v1` commits the canonical player message.
3. `enqueue_story_character_reply_job_v1` runs only for active, replyable story-character threads owned by that player.
4. The trigger coalesces older unprocessed messages in the same character thread as `superseded` and queues the newest message with a deterministic 12–40 second availability delay.
5. `econovaria-story-character-replies-v1` runs every 10 seconds and calls `process_due_story_character_reply_jobs_v1` with a maximum claim of 200 jobs.
6. The worker claims jobs with `FOR UPDATE SKIP LOCKED`, so future parallel workers can safely share the same queue.
7. The source message is classified by bounded intent and topic functions.
8. The response generator combines relationship state, country voice, topic-specific guidance, and intent-specific conversational behavior.
9. The reply is delivered through `deliver_story_character_message_v1`, preserving the existing thread, character identity, notification path, and message rendering.
10. Relationship memory records the latest player intent/topic and character reply. The queue job is marked `completed`.

## Response model

V1 deliberately does not use unrestricted generative AI. It recognizes a bounded set of conversational intents:

- greeting
- gratitude
- apology
- hostile
- disagreement
- concern
- advice
- negotiation
- question
- agreement
- statement

It also recognizes bounded decision topics:

- employment
- housing
- finance
- business
- logistics
- records
- security
- education
- supply
- general

Country-specific guidance keeps recurring characters distinct while avoiding invented facts. The engine can advise about tradeoffs and process, but it does not manufacture unverified geopolitical events, prices, laws, contract terms, or story outcomes.

## Character voice anchors

- NORTHREACH: documentation, employment terms, supply exposure
- YRETHIA: records, process integrity, port/admin pressure
- THALORIS: flexible commerce with traceability
- SOLVEND: credentials, technology, ownership, mobility restrictions
- ELDORAN: cash buffers, household costs, inventory risk
- VALERION: infrastructure, recurring costs, resource constraints
- LUMENOR: evidence quality, institutions, reversible decisions
- XALVORIA: leverage, financing, ownership, downside modeling
- DRAVENLOK: capacity, production quality, safety, input fragility
- SYNDALIS: privacy, security, access minimization, evidence

Unknown or future countries use a conservative general decision framework rather than failing the job.

## Durability and idempotency

`private.story_character_reply_jobs` is the durable source of work. A unique constraint on `(game_session_id, source_message_id)` prevents duplicate jobs for the same player message.

Character delivery uses an idempotency key derived from the immutable source message UUID:

`char_reply_<source-message-uuid-without-hyphens>`

Retries therefore cannot create duplicate canonical character replies.

Jobs move through:

`pending -> processing -> completed`

or, on transient failure:

`pending/retry -> processing -> retry -> ... -> dead_letter`

Rapid consecutive player messages are coalesced so the character answers the newest unprocessed message instead of emitting a burst of stale replies.

## Failure behavior

The worker claims with a lease and increments the attempt counter before entering the per-job subtransaction. If generation, delivery, or relationship-memory persistence fails, the per-job work rolls back and the queue row is returned to `retry` with bounded exponential backoff.

After five failed attempts the job becomes `dead_letter`. It remains inspectable rather than disappearing.

A service-role-only kill switch, `set_story_character_reply_engine_enabled_v1(boolean)`, pauses processing without disabling enqueueing. Player messages therefore remain durable while the responder is disabled and can be processed after re-enabling.

## Operations

`read_story_character_reply_engine_health_v1()` returns a service-role-only health snapshot including:

- enabled state
- pending count
- retry count
- processing count
- dead-letter count
- superseded count
- completions during the last hour
- oldest overdue job

The reply worker runs as one serialized 10-second pg_cron job with a 200-job maximum claim. Cron history for this worker is pruned after seven days to avoid unbounded scheduler-log growth.

## Security boundaries

- Queue/runtime tables live in the private schema.
- RLS is enabled and forced on private queue/runtime tables.
- Player/browser roles receive no queue or worker privileges.
- Public operational functions are revoked from `public`, `anon`, and `authenticated` and granted only to `service_role`.
- The trigger verifies game, player, thread, status, retention, character identity, and reply permission before enqueueing.
- The existing canonical delivery function remains the only path that creates a story-character reply in Messaging.

## V1 limitations and extension path

V1 is intentionally bounded rather than open-ended. It does not attempt deep semantic reasoning over arbitrary player prose, and it does not invent new story facts. More authored character-specific branches can be added without changing the queue/delivery architecture.

If throughput later requires parallel processing, the queue is already safe for multiple workers because claims use `FOR UPDATE SKIP LOCKED`. That scaling change can be made independently of the Player Messaging API and story-thread schema.
