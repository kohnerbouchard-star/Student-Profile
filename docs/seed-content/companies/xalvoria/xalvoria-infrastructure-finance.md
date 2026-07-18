# Xalvoria Infrastructure Finance

Stable content ID: `company.xalvoria.xalvoria-infrastructure-finance.v1`
Authoritative ticker: `XFIN`
Content type: company and stock-template enrichment
Version: 1.0.0-draft
Maturity: draft
Country: Xalvoria
Sector key: `BANKING_INFRASTRUCTURE_FINANCE`
Implementation status: existing authoritative stock template; enrichment metadata pending

## Authoritative template baseline

Source: `backend/supabase/migrations/20260623113000_seed_default_stock_templates_v1.sql`

- Company name: Xalvoria Infrastructure Finance
- Ticker: XFIN
- Country: XALVORIA
- Sector: BANKING_INFRASTRUCTURE_FINANCE
- Base price: 73.5500 ECO
- Beta: 1.1000
- Liquidity: 0.7800
- Long-run volatility: 0.041000
- Shares outstanding: 1,650,000
- Implied base market capitalization: 121,357,500 ECO
- Active: true

## Authoritative fundamentals

- Revenue growth: 0.05
- Profit margin: 0.17
- Debt level: 0.42
- Cash reserves: 0.62
- Innovation score: 0.38
- Supply-chain risk: 0.22
- Political exposure: 0.50
- Commodity exposure: 0.12

## Authoritative exposures

Country exposure:

- XALVORIA: 1.00

Sector exposure:

- BANKING_INFRASTRUCTURE_FINANCE: 0.74
- INFRASTRUCTURE: 0.34

Commodity exposure:

- METALS: 0.08

## Public company description

Xalvoria Infrastructure Finance structures and funds rail, energy, port, utility, and industrial projects across Econovaria. Its earnings depend on origination, interest and fee income, project completion, refinancing, and borrower performance.

Its apparent stability can deteriorate quickly when several large projects share the same political, currency, or construction risk.

## Company archetype

Leveraged infrastructure-finance company.

Player expectation:

- moderate growth and strong margins during investment expansion;
- exposure to interest rates, defaults, sanctions, project delay, and political backlash;
- less volatile than speculative technology in normal periods, but vulnerable to correlated credit events.

## Revenue drivers

- project-finance fees;
- interest income;
- refinancing and restructuring;
- asset-management participation;
- infrastructure demand;
- cross-border capital flows.

## Cost and risk drivers

- funding cost;
- borrower default;
- construction overrun;
- currency mismatch;
- sanctions and market access;
- capital requirements;
- political renegotiation;
- concentrated exposure to the Meridian Corridor.

## Meridian role

XFIN is a principal commercial participant in the finance-first model. It may arrange or join the launch tranche proposed by the Xalvorian Development Authority.

Potential benefits:

- large origination pipeline;
- fee and interest income;
- long-duration infrastructure assets;
- influence over execution structure.

Potential risks:

- concentration in one project network;
- contested ownership terms;
- borrower-country withdrawal;
- delayed construction;
- public scrutiny;
- security or route failures that reduce project cash flows.

## Event sensitivity

### Positive

- financing package accepted: moderate to major positive with concentration risk;
- project milestone completed: moderate positive;
- lower funding cost: mild positive;
- broad participation: mild positive if credit quality remains sound;
- transparent multilateral co-financing: mild positive and reduced concentration.

### Negative

- borrower default: major negative;
- asset-control backlash: moderate negative;
- Corridor suspension: major negative;
- sanctions or capital-access restriction: severe negative, scenario gated;
- construction overrun: moderate negative;
- policy-rate increase: mixed; margin benefit may be outweighed by funding and default pressure.

## Narrative arc

### Working title: The Cost of Certainty

Stages:

1. Meridian term sheet.
2. borrower review.
3. asset-control dispute.
4. co-financing or concentration decision.
5. construction milestone.
6. repayment performance or restructuring.
7. transparency reform, dominant-creditor outcome, or loss recognition.

Possible outcomes:

- diversified multilateral lender;
- profitable lead financier;
- contested creditor with high political exposure;
- write-down after suspension;
- stronger disclosure and risk controls.

## Player analysis questions

- Why can a profitable lender still become risky when borrowers are correlated?
- How do higher rates affect lending margin and default probability differently?
- Does collateral reduce loss or create political risk?
- How does shared financing change return and accountability?
- Which Meridian outcome produces the largest fee opportunity and which produces the lowest concentration risk?

## Arithmetic validation

73.5500 ECO × 1,650,000 shares = 121,357,500 ECO.

Status: passed.

## Technical mapping

Directly supported:

- all current stock-template baseline fields and exposure objects.

Metadata or future mapping:

- loan-book concentration;
- named borrower relationships;
- project milestones;
- debt restructuring story state;
- ownership clauses;
- institution-character relationships.

## Validation rules

- preserve ticker XFIN and do not duplicate the template;
- no statement that lending return is guaranteed;
- higher rates must have mixed effects;
- project and country events remain session scoped;
- sovereign project finance remains separate from player loans;
- no unsupported asset transfer mechanic;
- political exposure is a risk driver, not a moral label.

## Review status

- economic review: pending company re-review
- narrative review: pending
- gameplay and learning review: pending
- technical compatibility: direct template mapping confirmed; enrichment metadata pending