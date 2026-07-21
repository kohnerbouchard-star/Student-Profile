# Market Identity Canonicalization Decision v1

Status: approved design correction in progress  
Production authorization: false

## Verified problem

The deterministic reconciliation audit compared the 96 curated active-candidate instruments against the committed 3,200-record universe and found 96 blockers:

- 92 reused symbols pointing to different instrument or issuer identities;
- four curated commodity-reference symbols absent because the active layer uses class code `C` while the generated universe used `R`;
- 69 exchange mismatches among symbol matches;
- zero active-ID collisions.

## Canonical reference decisions

The market reference registry remains authoritative for exchange identity:

| Country | Canonical code | Superseded active code |
|---|---|---|
| Yrethia | `SBX` | `SPX` |
| Thaloris | `DHM` | `DHX` |
| Solvend | `AUX` | `ASX` |

Northreach already uses canonical `FGX`.

Commodity references use class code `C`, matching the curated active candidates. They remain non-tradable definition records unless a future reviewed capability explicitly supports a tradable product.

## Identity authority

For a symbol already present in a curated active candidate, the curated identity is canonical because financial enrichment and simulation evidence already reference its instrument ID and issuer ID.

The generated universe must overlay, rather than duplicate, the curated values for:

- instrument ID;
- display name;
- issuer ID;
- issuer name;
- exchange;
- asset class and sector where the curated candidate is more specific;
- risk and liquidity classifications where supplied.

The overlay must preserve:

- `activationAuthorized: false`;
- `runtimeSupport: unverified`;
- non-tradable treatment for indexes and commodity references;
- exactly 3,200 universe records;
- globally unique IDs, symbols, and names;
- deterministic country-file checksums.

## Naming decision

The ten country-qualified public-institution role families are approved for design use as functional taxonomy. The fifteen generated corporate roots remain placeholder library names and are not approved for public or production activation without further editorial and resemblance review.

## Exit gate

This correction is complete only when regeneration produces:

- 96 exact canonical active-to-universe identity matches;
- zero missing active symbols;
- zero exchange mismatches;
- zero active-ID conflicts;
- passing universe, issuer, editorial, preflight, and simulation-reference checks.
