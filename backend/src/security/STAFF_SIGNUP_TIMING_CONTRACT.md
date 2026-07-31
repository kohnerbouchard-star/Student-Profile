# Staff signup timing security contract

Public staff-account creation must not reveal whether a normalized email belongs to a new, pending, verified, suspended, or security-held identity through an account-dependent response-time difference.

The generic `202` response path therefore observes these invariants:

- account-dependent outcomes share the same bounded minimum-duration envelope;
- the additional jitter is generated from `crypto.getRandomValues` with rejection sampling, never modulo reduction;
- validation failures and explicit rate-limit responses remain immediate;
- timing-padding failure does not change the public response shape;
- connected staging measures end-to-end timing because identity-provider and transactional-email latency can exceed the application floor.

The required onboarding contract test ratchets these properties. Any future timing change must preserve generic response content, bounded latency, and an unbiased cryptographic jitter source.
