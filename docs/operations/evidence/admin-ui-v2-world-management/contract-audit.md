# World Management Contract Audit

Audit base: `4c17b942fcf4b2a6f60b629549f192d066053ba4`

The branch was rebased from the initial audit base onto this latest fetched `main`. The intervening mainline changes were confined to Player coordinator files, so the audited Admin World contracts were unchanged.

## Read contracts consumed

| Area | Contract | V2 use |
| --- | --- | --- |
| Campaign | `GET /world/campaign` | lifecycle state, scheduler, runtime phase/revision |
| Campaign history | `GET /world/campaign/history?limit=100` | committed phase/history supervision |
| Durable effects | `GET /world/campaign/effects?status=all&limit=100` | status/attempt/error supervision |
| Arrival Class | `GET /world/arrival-classes?limit=100` | country/class/revision supervision |
| Geography | `GET /world/geography` | runtime metadata, locations, routes, costs/durations |
| Travel | `GET /world/travel?limit=100` | travel state/journeys/currency/cost supervision |
| Residency | `GET /world/residency?limit=100` | country eligibility/current/pending residency and currencies |

## Write contracts exposed

| V2 action | Authoritative contract | Guard |
| --- | --- | --- |
| Pause campaign | `POST /world/campaign/control` | current campaign ID + expected revision + confirmation |
| Resume campaign | `POST /world/campaign/control` | current campaign ID + expected revision + confirmation |
| Emergency disable campaign | `POST /world/campaign/control` | current campaign ID + expected revision + confirmation |
| Recover failed effect | `POST /world/campaign/effects/:effect/recover` | failed state + reviewed idempotency + confirmation |
| Correct Arrival Class | `POST /world/arrival-classes/:assignment/correct` | existing class enum + expected revision + confirmation |
| Close route | `POST /world/routes/state` | current World revision + existing close semantics + confirmation |
| Reopen route | `POST /world/routes/state` | current World revision + existing reopen semantics + confirmation |

## Explicitly excluded

- `POST /world/campaign/manual-trigger`: excluded because its effect kinds include News/notifications/market/store side effects and News & Events must remain a separate route.
- campaign `correct_phase`: supported at Backend level but not exposed by the current reviewed Admin workflow.
- arbitrary route `restricted` state or multiplier editing: Backend accepts these, but current Admin workflow only exposes close/reopen.
- country-definition mutation: no current World Admin contract.
- currency/FX mutation: no current World Admin contract.
- player ownership identifiers: never rendered.
- effect payload/idempotency internals: never rendered.

## Navigation boundary

`world-management` becomes native `v2` with permission `world.manage`.

`news-events` remains `planned` with no controller, API, CSS, or implementation added by this change.
