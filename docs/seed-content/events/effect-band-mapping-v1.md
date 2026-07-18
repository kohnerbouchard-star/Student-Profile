# Event Effect Band Mapping v1

Status: quantitative design draft
Owner domain: country economics, markets, and event validation
Implementation status: proposed mapping; authoritative event-application mechanics and idempotency still require backend verification

## Purpose

Translate narrative effect classes—trace, minor, moderate, major, severe, and systemic—into bounded candidate deltas for the economic indicators currently supported by the country snapshot model.

This file does not apply effects. It defines design limits and validation expectations for later technical mapping.

## Governing principles

1. Event effects are game-session scoped.
2. Reusable definitions contain approved ranges, not live outcomes.
3. Runtime instances select a value inside the approved range.
4. Effects must remain inside authoritative field bounds.
5. Standard-profile ordinary events should be gradual and recoverable.
6. A major or severe event requires explicit scenario permission.
7. Negative and positive effects are not automatically symmetric.
8. Indicators with ambiguous direction require event-specific review.
9. Monetary conversion rates are not changed directly by this mapping until currency architecture is approved.
10. The existing 0.1 gradual-adjustment constant is treated as a design ceiling signal, not presumed to be the current event-application algorithm.

## Semantic classes

### Trace

Purpose:

- explanatory detail;
- low-visibility movement;
- no standalone required action.

Typical duration:

- one short period;
- may be absorbed by normal volatility.

### Minor

Purpose:

- visible movement;
- supports an optional response;
- should not dominate a country or market.

### Moderate

Purpose:

- material decision pressure;
- ordinary warning or meaningful opportunity;
- standard-profile maximum for most country events.

### Major

Purpose:

- strong multi-system pressure;
- required action or clear recovery plan;
- generally one active major global event at a time.

### Severe

Purpose:

- crisis-level condition;
- explicit scenario gate;
- multiple safeguards and recovery stages required.

### Systemic

Purpose:

- multi-country structural shock;
- instructor-selected or specialized scenario only;
- cannot be combined freely with another severe or systemic event.

## Additive versus multiplicative treatment

Recommended design convention:

- rates and bounded scalar indicators use additive deltas;
- prices and stock shocks use separately reviewed percentage or log-return effects;
- exchange-rate pairs use authoritative pair-rate generation, not a direct event delta in this file;
- player balances, inventory, holdings, and loans are never altered by generic country stat deltas.

Example:

- inflation 0.035 plus 0.010 becomes 0.045;
- infrastructure 1.05 minus 0.04 becomes 1.01;
- a stock price effect is handled through the stock-event model, not by adding 0.04 ECO.

## Candidate delta bands by indicator

Values below are absolute additive changes unless otherwise stated.

### Real GDP index

| Class | Absolute delta |
|---|---:|
| Trace | 0.1–0.4 |
| Minor | 0.5–1.5 |
| Moderate | 1.6–3.5 |
| Major | 3.6–6.0 |
| Severe | 6.1–10.0 |
| Systemic | 10.1–18.0 |

Normal event guidance:

- do not apply the entire annual or long-period economic effect instantly;
- use phased movement or a target path where the runtime supports it.

### GDP growth rate

| Class | Absolute delta |
|---|---:|
| Trace | .0005–.0015 |
| Minor | .0016–.0050 |
| Moderate | .0051–.0125 |
| Major | .0126–.0250 |
| Severe | .0251–.0500 |
| Systemic | .0501–.1000 |

### Inflation rate

| Class | Absolute delta |
|---|---:|
| Trace | .0005–.0015 |
| Minor | .0016–.0050 |
| Moderate | .0051–.0150 |
| Major | .0151–.0300 |
| Severe | .0301–.0600 |
| Systemic | .0601–.1200 |

Inflation changes should identify whether the shock is general or initially limited to food, energy, transport, or another category.

### Unemployment rate

| Class | Absolute delta |
|---|---:|
| Trace | .0005–.0010 |
| Minor | .0011–.0040 |
| Moderate | .0041–.0120 |
| Major | .0121–.0250 |
| Severe | .0251–.0500 |
| Systemic | .0501–.1000 |

A single company event should not create a national major unemployment change without sector and scale justification.

### Policy interest rate

| Class | Absolute delta |
|---|---:|
| Trace | .0005–.0010 |
| Minor | .0011–.0030 |
| Moderate | .0031–.0075 |
| Major | .0076–.0150 |
| Severe | .0151–.0300 |
| Systemic | .0301–.0600 |

Interest-rate changes require an authorized policy event. Ordinary private-sector events should affect expectations and company exposure rather than directly alter the policy rate.

### Consumer and business confidence

| Class | Absolute point delta |
|---|---:|
| Trace | 0.5–1.5 |
| Minor | 1.6–4.0 |
| Moderate | 4.1–9.0 |
| Major | 9.1–15.0 |
| Severe | 15.1–25.0 |
| Systemic | 25.1–40.0 |

Confidence should recover through verified outcomes, not automatic time alone when the cause is institutional trust failure.

### Cost of living, regional price, supply constraint, import dependency

Neutral reference: 1.0

| Class | Absolute delta |
|---|---:|
| Trace | .0025–.0100 |
| Minor | .0101–.0300 |
| Moderate | .0301–.0750 |
| Major | .0751–.1250 |
| Severe | .1251–.2250 |
| Systemic | .2251–.3500 |

Interpretation:

- higher cost of living is generally worse for households;
- higher regional price multiplier raises local prices;
- higher supply constraint indicates tighter supply;
- higher import dependency increases external exposure.

Import dependency should generally move slowly. Short-lived events may alter import reliance or effective exposure through metadata rather than permanently rewrite the structural index.

### Tax and subsidy rates

| Class | Absolute delta |
|---|---:|
| Trace | .0005–.0010 |
| Minor | .0011–.0050 |
| Moderate | .0051–.0150 |
| Major | .0151–.0300 |
| Severe | .0301–.0600 |
| Systemic | .0601–.1200 |

These are policy choices, not generic event effects. An event may create pressure for a tax or subsidy response but should not change the rate without an authorized decision.

### Exchange-rate index

Status: macro signal only pending currency decision.

Candidate design band if retained as a normalized macro field:

| Class | Absolute delta |
|---|---:|
| Trace | .0025–.0100 |
| Minor | .0101–.0250 |
| Moderate | .0251–.0600 |
| Major | .0601–.1000 |
| Severe | .1001–.1800 |
| Systemic | .1801–.3000 |

Do not use these values as direct transaction conversion rates unless the approved currency architecture explicitly adopts that model.

### Currency stability, export strength, political stability, infrastructure, energy security

Neutral reference: 1.0

| Class | Absolute delta |
|---|---:|
| Trace | .0025–.0100 |
| Minor | .0101–.0300 |
| Moderate | .0301–.0750 |
| Major | .0751–.1250 |
| Severe | .1251–.2250 |
| Systemic | .2251–.3500 |

Direction:

- higher currency stability is generally better;
- higher export strength is generally better;
- higher political stability is generally better;
- higher infrastructure is generally better;
- higher energy security is generally better.

Permanent structural improvements should be rare and require completed investment, not merely announced spending.

### Trade-balance index

| Class | Absolute delta |
|---|---:|
| Trace | 0.25–1.00 |
| Minor | 1.01–3.00 |
| Moderate | 3.01–8.00 |
| Major | 8.01–15.00 |
| Severe | 15.01–25.00 |
| Systemic | 25.01–40.00 |

A stronger trade balance is not always an unqualified benefit. The event must explain whether the change comes from stronger exports, weaker imports, recession, or price movement.

### Market-risk index

Neutral reference: 1.0

| Class | Absolute delta |
|---|---:|
| Trace | .0025–.0100 |
| Minor | .0101–.0300 |
| Moderate | .0301–.0750 |
| Major | .0751–.1250 |
| Severe | .1251–.2250 |
| Systemic | .2251–.3500 |

Higher market risk is generally worse for stability but may increase market-data, insurance, or selected trading-service demand.

## Event complexity limits

### Ordinary country event

Recommended maximum:

- 2 primary indicator deltas;
- 2 secondary indicator deltas;
- 1–3 market exposure effects;
- no direct player balance effect.

### Major global event

Recommended maximum:

- 3–5 primary country or global indicator effects;
- targeted country variation;
- sector and company shocks;
- one required decision window;
- explicit recovery stage.

More deltas do not automatically create realism. They increase review and interaction risk.

## Cumulative caps

### Standard profile

Within one event period:

- no country receives more than one major economic delta from the same event family;
- cumulative additive movement in a 0.5–2.0 index should generally not exceed .10 without a severe-event gate;
- cumulative confidence movement should generally not exceed 12 points;
- cumulative inflation or unemployment movement should generally not exceed .02;
- cumulative GDP-growth movement should generally not exceed .02;
- one major global event at a time;
- no severe or systemic event while an unresolved major global event remains active.

### Crisis-response profile

May exceed standard caps only when:

- scenario declares the higher limits before activation;
- recovery content is enabled;
- instructor sees the projected capped result;
- country viability remains above the emergency floor;
- the effect cannot be duplicated by retries.

## Decay and recovery

Every temporary event should define one of:

- fixed expiry and full reversal;
- phased decay;
- recovery event;
- persistent residual effect;
- permanent structural change after explicit investment or failure.

Recommended decay model for ordinary temporary deltas:

- 50% of remaining temporary effect removed at first recovery step;
- 30% at second step;
- remaining 20% removed or retained as a reviewed residual.

This is a design convention, not an implementation claim.

Permanent changes require:

- completion condition;
- explicit player and Admin explanation;
- versioned event result;
- viability recheck;
- no automatic reset at session tick.

## Stock-market mapping

Country-stat deltas and stock-event shocks are separate but related.

Recommended process:

1. Apply or record the country event condition.
2. Determine affected country, sectors, and tickers from exposure metadata.
3. Select bounded market shocks by event severity and exposure strength.
4. Allow the market runner to apply deterministic drift and volatility rules.
5. Record event, selected shock, source, and result.

Do not set stock price directly from narrative copy.

Candidate per-event stock shock bands require exact engine audit before approval.

## Pilot Meridian event candidates

## Forum announced

Country deltas:

- none by default;
- optional trace business-confidence increase in participating countries.

Market effects:

- trace infrastructure and logistics sentiment only.

## Sableport capacity warning

Primary Yrethia candidates:

- supply constraint: +.04 to +.07;
- infrastructure: -.02 to -.04 when maintenance pressure is material;
- business confidence: -3 to -6;
- market risk: +.03 to +.06.

Secondary global candidates:

- affected import-dependent countries: supply constraint +.01 to +.03.

Recovery:

- maintenance, rerouting, fee rationing, or capacity investment.

## Eldoran harvest revision

Primary Eldoran candidates:

- inflation: +.006 to +.012;
- supply constraint: +.04 to +.07;
- consumer confidence: -3 to -6;
- trade balance: mixed -3 to +3 depending on price and volume.

Secondary food-importing countries:

- cost of living: +.01 to +.03;
- import dependency: narrative exposure unless structural reliance changes.

Recovery:

- final harvest, imports, reserve action, logistics, or next-season improvement.

## Northreach export review

Primary Northreach candidates:

- export strength: -.03 to -.06 during delay;
- trade balance: -2 to -5;
- currency stability: -.01 to -.03 if uncertainty is high;
- market risk: +.03 to +.06.

Input-dependent partners:

- supply constraint: +.02 to +.05.

The review itself should not create the same effect as a full export ban.

## Valerion reservoir warning

Primary Valerion candidates:

- energy security: -.04 to -.07;
- consumer confidence: -2 to -5;
- supply constraint: +.02 to +.05;
- infrastructure: no direct decline unless the event identifies an actual failure.

Recovery:

- weather, conservation, imports, diversified supply, or investment.

## Solvend talent constraint

Primary Solvend candidates:

- business confidence: -3 to -6;
- GDP growth outlook: -.003 to -.008;
- supply constraint: +.03 to +.06;
- market risk: +.02 to +.05.

Unemployment should not rise automatically during a skilled-labor shortage.

Recovery:

- retention, training, recruitment, outsourcing, or reduced scope.

## Customs security intrusion

Primary affected-country candidates:

- business confidence: -5 to -9;
- market risk: +.06 to +.10;
- supply constraint: +.04 to +.08;
- infrastructure: -.02 to -.05 only if operational integrity is materially impaired;
- trade balance: -3 to -8 for highly affected trade hubs;
- political stability: -.01 to -.04 when access conflict or attribution dispute escalates.

Global cap:

- no standard-profile country should receive more than one major and two moderate country-stat deltas from the initial intrusion stage.

Recovery:

- integrity restored;
- cargo reconciled;
- access normalized;
- audit completed;
- correction issued where needed.

## Event decision effects

The original event and the policy response should be recorded separately.

Example:

- harvest warning increases supply constraint;
- reserve release response reduces short-term supply constraint but creates reserve metadata or future vulnerability;
- targeted household support reduces household harm without pretending supply increased;
- export restriction changes trade balance and partner pressure.

A response should not overwrite the source event or erase its audit history.

## Preflight validation

Before applying a numeric event instance, calculate:

- source snapshot;
- requested deltas;
- cumulative active temporary deltas;
- authoritative field bounds;
- profile-specific cap;
- capped result;
- viability score before and after;
- affected stocks and sectors;
- duration and recovery;
- idempotency key;
- blocking conflicts.

Block application when:

- a field is unsupported;
- a rate or index meaning is unresolved;
- result exceeds bounds;
- profile cap is exceeded;
- severe concurrency rule fails;
- no recovery exists;
- the same event instance was already applied;
- session ownership is invalid.

## Review requirements

- economic direction review;
- country-lore consistency review;
- market exposure review;
- gameplay clarity review;
- technical application and idempotency review;
- recovery and viability review.

## Blocking work

1. Verify the authoritative event-application RPC or service.
2. Confirm whether `stat_deltas` are additive and how result snapshots are written.
3. Audit stock-event shock semantics and caps.
4. Test candidate Meridian deltas against the baseline and viability model.
5. Approve currency architecture before any exchange-rate event becomes transactional.
6. Create automated or reviewable preflight output in a later implementation tranche.

## Review status

- economic review: draft mapping ready for simulation
- narrative review: directions align with event copy
- gameplay review: standard-profile caps align with classroom operation
- technical review: blocked on application-path audit