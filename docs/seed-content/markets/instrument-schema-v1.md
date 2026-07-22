# Market Instrument Schema v1

Status: design schema  
Runtime authority: unverified

## Shared fields

Every record contains:

| Field | Meaning |
|---|---|
| `id` | Stable versioned content identifier |
| `symbol` | Globally unique fictional market symbol |
| `name` | Unique player-facing instrument name |
| `country` | Country of primary economic ownership or administration |
| `currency` | Country listing or denomination currency |
| `exchange` | Fictional primary listing or administration venue |
| `instrumentType` | Normalized instrument class |
| `assetClass` | Broader economic asset family |
| `sector` | Sector or benchmark taxonomy |
| `issuerId` | Stable issuer or administrator identifier |
| `issuerName` | Player-facing issuer or administrator |
| `seedStatus` | Content maturity; currently `design-candidate` |
| `runtimeSupport` | Capability status; currently `unverified` |

## Instrument types

### `common_equity`

Additional fields:

- `listingRole`;
- `marketCapTier`;
- `riskClass`;
- `liquidityClass`;
- `dividendProfile`;
- `narrativeTags`.

These are classification fields, not a complete financial statement.

### `preferred_convertible`

Additional fields:

- `hybridType`;
- `conversionTermsStatus`;
- `riskClass`;
- `liquidityClass`.

No conversion ratio, call provision, preference amount, or dividend value is approved.

### `corporate_bond`

Additional fields:

- `bondType`;
- `tenorYears`;
- `creditGradeBand`;
- `couponStatus`;
- `riskClass`;
- `liquidityClass`.

Tenor is relative. No absolute maturity or coupon is approved.

### `sovereign_public_bond`

Additional fields:

- `bondType`;
- `tenorYears`;
- `creditGradeBand`;
- `couponStatus`;
- `riskClass`;
- `liquidityClass`.

Issuers include the national treasury and six country-specific public authorities or development institutions.

### `etf_fund`

Additional fields:

- `fundType`;
- `underlyingTheme`;
- `weightingMethod`;
- `riskClass`;
- `liquidityClass`.

Holdings, fees, tracking logic, authorized participants, and rebalancing remain undefined.

### `listed_trust`

Additional fields:

- `trustType`;
- `underlyingTheme`;
- `riskClass`;
- `liquidityClass`.

Property and infrastructure cash-flow assumptions remain uncalibrated.

### `index`

Additional fields:

- `indexFamily`;
- `weightingMethod`;
- `tradable: false`;
- `calculationStatus: design-only`;
- reference risk and liquidity classifications.

An index is not itself a security. A future fund or derivative may reference an index only if supported.

### `commodity_reference`

Additional fields:

- `underlyingTheme`;
- `tradable: false`;
- `calculationStatus: design-only`;
- `unitStatus: uncalibrated`;
- reference risk and liquidity classifications.

These records may represent a commodity price, capacity index, freight benchmark, sector basket, input-cost measure, or policy reference. They are not automatically futures contracts.

## Fields intentionally omitted

The generated library does not fabricate:

- current prices;
- historical prices;
- revenue;
- earnings;
- cash flow;
- shares outstanding;
- market capitalization;
- book value;
- debt amount;
- coupon;
- yield;
- duration;
- convexity;
- index weights;
- fund holdings;
- trust net asset value;
- order-book depth;
- corporate actions.

Those values require a reviewed calibration model and executable simulation.

## Import boundary

A future importer must map the design schema to authoritative backend fields.

It must not:

- create browser-selectable ownership IDs;
- infer session ownership from content;
- activate unsupported instrument classes;
- use the content ID as a player or game-session ID;
- treat an index or reference benchmark as a tradable security;
- invent missing prices or coupons during import;
- overwrite live market state during a content-definition update.
