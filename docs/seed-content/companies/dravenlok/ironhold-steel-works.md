# Ironhold Steel Works

Stable content ID: `company.dravenlok.ironhold-steel-works.v1`
Authoritative ticker: `IRST`
Content type: company and stock-template enrichment
Version: 1.0.0-draft
Maturity: draft
Country: Dravenlok
Sector key: `HEAVY_INDUSTRY_MANUFACTURING`
Implementation status: existing authoritative stock template; enrichment metadata pending

## Authoritative template baseline

Source: `backend/supabase/migrations/20260623113000_seed_default_stock_templates_v1.sql`

- Company name: Ironhold Steel Works
- Ticker: IRST
- Country: DRAVENLOK
- Sector: HEAVY_INDUSTRY_MANUFACTURING
- Base price: 49.9500 ECO
- Beta: 1.2000
- Liquidity: 0.6400
- Long-run volatility: 0.055000
- Shares outstanding: 2,400,000
- Implied base market capitalization: 119,880,000 ECO
- Active: true

## Authoritative fundamentals

- Revenue growth: 0.04
- Profit margin: 0.09
- Debt level: 0.48
- Cash reserves: 0.40
- Innovation score: 0.32
- Supply-chain risk: 0.52
- Political exposure: 0.56
- Commodity exposure: 0.74

## Authoritative exposures

Country exposure:

- DRAVENLOK: 1.00

Sector exposure:

- HEAVY_INDUSTRY_MANUFACTURING: 0.86
- DEFENSE_SECURITY: 0.28

Commodity exposure:

- STEEL: 0.78
- FUEL: 0.28

## Public company description

Ironhold Steel Works operates large steel, foundry, and industrial-material facilities serving rail, machinery, construction, and selected strategic manufacturing customers.

The company benefits from scale and large procurement programs, but its high fixed costs, energy use, maintenance requirements, debt, and export dependence make its earnings highly cyclical.

## Company archetype

Cyclical leveraged industrial incumbent.

Player expectation:

- strong response to construction and industrial demand;
- material downside from energy, maintenance, export, sanctions, and debt pressure;
- lower innovation and margin than AURA, but greater physical production capacity.

## Revenue drivers

- rail and infrastructure steel;
- industrial machinery demand;
- construction programs;
- state procurement;
- export access;
- utilization of fixed capacity.

## Cost drivers

- energy and fuel;
- raw materials;
- labor;
- maintenance;
- debt service;
- environmental and safety compliance;
- transport and export cost.

## Meridian role

IRST is a primary material supplier for rail, port, grid, and construction works.

Potential benefits:

- guaranteed volumes;
- higher factory utilization;
- modernization funding;
- stable long-term order book.

Potential risks:

- overexpansion before orders are final;
- energy and component constraints;
- cost overruns;
- cancellation or fragmentation;
- political procurement requirements;
- safety failure under accelerated production.

## Event sensitivity

### Positive

- funded Meridian construction tranche: major positive with execution risk;
- guaranteed purchase volumes: moderate positive;
- steel-demand increase: moderate positive;
- modernization milestone: mild to moderate positive;
- lower energy cost: moderate positive.

### Negative

- Corridor suspension: major negative;
- energy-price shock: major negative;
- factory accident: severe company-specific negative, scenario gated;
- export restriction: moderate to major negative;
- debt-refinancing pressure: moderate negative;
- construction-material substitution or reduced scope: moderate negative.

## Narrative arc

### Working title: The Modernization Furnace

Stages:

1. Meridian order opportunity.
2. capacity and maintenance audit.
3. guarantee decision.
4. energy and component constraint.
5. modernization or accelerated legacy production.
6. delivery milestone, delay, or safety incident.
7. competitive renewal, protected legacy system, or restructuring.

Possible outcomes:

- modernized competitive producer;
- profitable but overleveraged expansion;
- reduced specialized supplier;
- state-supported legacy company;
- restructuring after missed commitments.

## Player analysis questions

- Why does high utilization improve profit until capacity and maintenance constraints appear?
- How do debt and energy cost change the value of a guaranteed order?
- Should the company expand before financing and components are secured?
- How does a long-term order reduce demand risk while increasing concentration?
- Why can a steel-demand boom still hurt consumers and downstream companies?

## Arithmetic validation

49.9500 ECO × 2,400,000 shares = 119,880,000 ECO.

Status: passed.

## Technical mapping

Directly supported:

- all current stock-template baseline fields and exposure objects.

Metadata or future mapping:

- capacity utilization;
- maintenance backlog;
- factory location;
- labor agreement;
- procurement guarantee;
- modernization project state;
- safety event detail.

## Validation rules

- preserve ticker IRST and do not duplicate the template;
- event benefit must account for energy, maintenance, and debt;
- no automatic positive effect from defense or crisis demand;
- safety events remain non-graphic and system focused;
- company events and prices remain session scoped;
- no bankruptcy, merger, or split mechanic without support;
- market copy must communicate cyclicality and leverage.

## Review status

- economic review: pending company re-review
- narrative review: pending
- gameplay and learning review: pending
- technical compatibility: direct template mapping confirmed; enrichment metadata pending