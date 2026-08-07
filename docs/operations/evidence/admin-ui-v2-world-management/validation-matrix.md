# World Management Validation Matrix

| Requirement | Evidence |
| --- | --- |
| World loaded | populated authoritative batch normalizes to runtime/campaign/country/currency/geography/travel/residency model |
| World missing | empty authoritative batch produces `isEmpty` and V2 empty state |
| World stale | controller retains last successful model after refresh failure and enters shared `stale` state |
| Multiple countries | fixture projects Northreach and Hanseong Republic from geography/residency state |
| Long/Korean names | Korean location names and long Unicode labels are preserved by normalization |
| Authoritative currencies | currency list is derived from residency/travel `currency_code`; no invented FX state |
| Supported mutation validation | API tests exact campaign/effect/Arrival Class/route request bodies; invalid campaign actions are rejected client-side |
| High-impact confirmation | all exposed lifecycle, recovery, Arrival Class, and route writes pass through `AdminConfirmDialog` |
| Permission denial | controller refuses reads without `world.manage`; shell retains shared permission boundary |
| Safe errors | 403/backend detail is normalized to a safe Admin error envelope without raw SQL/service-role/UUID text |
| No private IDs | normalization drops `player_id`, UUID-shaped text, digests, idempotency keys, effect payloads |
| Mobile | World table cards activate at 900 px; single-column/touch layout activates at 640 px |
| News & Events separation | `news-events` remains planned; World API has no manual-trigger or publish-news method |
| Overview regression | route remains native V2 and controller composition remains intact |
| Store regression | route remains native V2 and controller composition remains intact |
| Market regression | financial Market remains native V2; Marketplace remains separate/planned |
| Lifecycle/game scope | route-owned API defaults to existing Admin BFF; mutations remain session/CSRF/game/idempotency scoped |
