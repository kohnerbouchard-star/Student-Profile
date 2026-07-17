# Player identity boundary

## Canonical ownership identity

The immutable backend player UUID is the canonical owner key for every durable player record, including:

- ledger entries and account balances;
- stock orders, trades, holdings, and watchlists;
- contracts, submissions, reviews, and rewards;
- inventory ownership, reservations, usage, and grants;
- marketplace listings and settlements;
- loans, repayments, business records, progression, and messages;
- audit events and historical session relationships.

The browser must never choose or replace this UUID. Authenticated backend handlers derive it from the validated player session.

## Mutable Player ID

`Player ID` is a mutable player-facing identifier. It may be used for:

- player sign-in together with Game/Session Code and Access Code;
- RFID or card assignment;
- player-to-player discovery and display;
- recipient lookup before a transfer or other player-directed action.

Changing Player ID must update only the credential and lookup layer. It must not rewrite ownership records or move economic data because those records remain attached to the immutable player UUID.

## Access Code

`Access Code` is a separate mutable credential. It is not a player UUID and is not an ownership key. It must never appear in player-terminal responses, transaction payloads, logs, URLs, analytics, or browser persistence.

## Player-directed transactions

The player terminal sends a mutable lookup value named `recipientPlayerIdentifier`. The authoritative backend must:

1. validate the authenticated sender session;
2. derive the sender UUID from that session;
3. resolve `recipientPlayerIdentifier` within the current game/session to exactly one active recipient UUID;
4. reject missing, ambiguous, inactive, or self-recipient matches;
5. perform authorization, balance, limit, idempotency, and atomic-settlement checks;
6. persist sender and recipient UUIDs in all transaction and audit records;
7. return only player-safe display information and a transaction receipt.

The client must not submit a recipient UUID as an alternative path around server-side lookup and authorization.

## Required invariants

- Player ID can change without changing player UUID.
- Access Code can change without changing player UUID.
- Sign-in resolves current credentials to the existing player UUID.
- Old Player IDs stop authenticating after an authoritative change unless an explicit, time-bounded alias policy exists.
- Balances, inventory, contracts, holdings, history, and permissions survive Player ID and Access Code changes.
- Every backend economic mutation remains UUID-authoritative and server-owned.
