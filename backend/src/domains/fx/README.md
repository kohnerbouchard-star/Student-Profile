# FX Domain

The FX domain owns Econovaria's canonical game-scoped exchange-rate fixing
calculation. Its pure V1 entrypoint is:

```ts
calculateFxFixing(input: FxFixingEngineInput): FxFixingEngineResult
```

The engine accepts one immutable versioned policy, one complete ten-country
macro snapshot set, previous `unitsPerEco` values, and optional Story shocks. It
validates and consumes the policy's weights, caps, normalizers, zero-weight
non-circular signals, and 08:00 boundary instead of relying on separate runtime
constants. It uses scaled `BigInt` arithmetic, median-centred signals, integer
basis-point components, and half-away-from-zero rounding. Positive basis points
mean depreciation (more local units per ECO). Its scale matches persisted
`numeric(38,18)` values, and ECO is always exactly `1.000000000000000000`.

The persisted Policy V1 caps the GDP, inflation, real-interest, trade, and
confidence/stability components at 50, 45, 30, 40, and 35 basis points. Normal
movement is capped at 200 basis points; aggregated Story movement and the final
crisis movement are capped at 1,500 basis points.

`canonicalizeFxFixingInput` returns stable validated calculation evidence. The
database remains authoritative for the persisted input digest so PostgreSQL JSON
canonicalization cannot drift from a TypeScript serializer. Scheduling, leases,
persistence, database writes, quotes, orders, clearing, and customer spreads
remain outside this calculation lane.
