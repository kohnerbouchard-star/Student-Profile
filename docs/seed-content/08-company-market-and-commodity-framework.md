# Company, Market, and Commodity Framework

Status: draft foundation

## Purpose

Define how fictional companies, equities, national indexes, industries, and commodities should be created, valued, connected to country canon, and affected by events.

## Market universe goals

The initial market should:

- represent all ten countries;
- provide clear sector and country diversification;
- include stable, growth, cyclical, and distressed profiles;
- respond to understandable economic drivers;
- avoid deterministic guaranteed-return sequences;
- support classroom analysis without requiring professional finance knowledge;
- remain arithmetically coherent.

## Initial quantity target

- 30 listed companies;
- approximately 3 companies per country;
- 10 national indexes;
- 1 global index if supported;
- 12–15 industries;
- approximately 10 reference commodities;
- 10 company story arcs in the first narrative pack.

## Company archetype distribution

Each country should normally include:

1. a relatively stable incumbent;
2. a growth or strategic expansion company;
3. a cyclical, leveraged, volatile, or turnaround company.

The archetypes should reflect country identity rather than repeating the same three businesses with different names.

## Company-definition fields

Every company should define:

- stable company ID;
- legal or full display name;
- short name;
- unique ticker;
- country of primary listing;
- headquarters location;
- primary industry;
- secondary industries;
- company archetype;
- public description;
- products and services;
- customer base;
- revenue drivers;
- cost drivers;
- major inputs;
- major markets;
- country and trade exposure;
- commodity exposure;
- currency exposure;
- interest-rate exposure;
- regulatory exposure;
- environmental exposure;
- cyber exposure;
- starting revenue;
- operating profitability concept;
- debt profile;
- cash profile;
- growth profile;
- shares outstanding;
- starting share price;
- market capitalization;
- dividend policy;
- volatility classification;
- liquidity classification if relevant;
- event sensitivities;
- associated institutions and characters;
- company story arcs;
- logo and asset requirements;
- review status;
- implementation mapping.

## Arithmetic integrity

Required checks:

- market capitalization equals share price multiplied by shares outstanding;
- revenue, profit, debt, and valuation are internally plausible;
- dividend amount is supportable by the defined earnings and cash profile;
- high leverage increases interest-rate and refinancing sensitivity;
- growth companies are not simultaneously low-risk, high-dividend, low-valuation, and high-growth without a documented reason;
- distressed companies have a credible cause and possible recovery;
- stock split, merger, or bankruptcy concepts include implementation and holdings treatment before approval.

## Country company directions

### Northreach

Candidate company types:

- strategic minerals producer;
- northern energy and pipeline operator;
- arctic logistics and cold-engineering firm.

### Yrethia

- port operator;
- maritime insurer or freight-finance company;
- logistics-software and customs-automation company.

### Thaloris

- repair and salvage operator;
- bonded-warehouse and re-export company;
- high-risk logistics or secondary-market platform.

### Solvend

- AI and data-systems company;
- aerospace and satellite manufacturer;
- precision-engineering or advanced-materials company.

### Eldoran

- agricultural producer or food processor;
- rail and inland logistics operator;
- commodity exchange or wholesale-distribution company.

### Valerion

- clean-energy utility;
- water-infrastructure company;
- tourism, premium-services, or green-finance company.

### Lumenor

- education and training provider;
- media and information company;
- civic-technology, conference, or research-services company.

### Xalvoria

- infrastructure bank;
- construction and megaproject company;
- luxury manufacturing or energy-investment company.

### Dravenlok

- steel producer;
- rail, vehicle, or machinery manufacturer;
- defense-industrial or state-enterprise turnaround company.

### Syndalis

- cybersecurity company;
- fintech and payments platform;
- data-center, market-data, or undersea-network operator.

## Ticker rules

- unique across all market assets;
- 3–5 uppercase letters where possible;
- not equal to a currency code;
- memorable but not a direct real-company imitation;
- stable after production release except through an explicit corporate action.

## Industry taxonomy requirements

Recommended industries:

- agriculture and food;
- energy;
- mining and materials;
- manufacturing;
- defense and aerospace;
- technology and software;
- telecommunications and data infrastructure;
- finance and insurance;
- healthcare and medicine;
- construction and infrastructure;
- transportation and logistics;
- retail and consumer services;
- media and education;
- tourism and hospitality;
- public and professional services.

Each industry needs:

- stable ID;
- description;
- demand drivers;
- cost drivers;
- business-cycle sensitivity;
- interest-rate sensitivity;
- currency sensitivity;
- trade sensitivity;
- labor intensity;
- capital intensity;
- environmental sensitivity;
- associated countries;
- associated commodities;
- common events.

## Commodity catalog directions

Initial reference commodities:

- staple food basket;
- grain;
- petroleum;
- natural gas;
- industrial steel;
- strategic minerals;
- electronic components;
- medicine and medical inputs;
- construction materials;
- shipping capacity or freight index.

A commodity may be a direct tradeable asset only if supported. Otherwise it may remain a reference index used by events and company exposure.

## Commodity-definition fields

- stable commodity ID;
- name;
- unit;
- reference-price concept;
- producers;
- consumers;
- storage and perishability;
- transport sensitivity;
- substitutes;
- production lead time;
- supply events;
- demand events;
- country exposures;
- industry exposures;
- company exposures;
- scenario restrictions;
- technical support status.

## Index framework

Each national index should define:

- stable index ID;
- name;
- country;
- constituent policy;
- weighting method;
- starting level;
- rebalancing policy;
- use in news and country summaries;
- behavior when a company is added, suspended, or retired.

A global index should not be added unless the current market model can calculate it authoritatively and all countries have sufficient representation.

## Event exposure model

For every company, record directional sensitivities to:

- growth;
- inflation;
- interest rates;
- domestic currency;
- energy prices;
- labor costs;
- trade volume;
- shipping cost;
- regulation;
- public confidence;
- country stability;
- named event families.

Use bounded exposure classes rather than unrestricted custom formulas during content design:

- strong negative;
- moderate negative;
- mild negative;
- neutral;
- mild positive;
- moderate positive;
- strong positive.

The technical mapping may convert these to supported coefficients.

## Company story arc examples

### Solvend research breakthrough

- research grant;
- prototype success;
- foreign acquisition offer;
- ownership decision;
- commercialization or talent departure.

### Dravenlok industrial turnaround

- state contract;
- capacity expansion;
- component shortage;
- debt pressure;
- restructuring or recovery.

### Valerion greenwashing investigation

- premium project announcement;
- evidence challenge;
- regulatory review;
- financing reaction;
- verified reform or reputation decline.

### Syndalis platform trust crisis

- security incident;
- disputed attribution;
- user and regulator response;
- audit;
- centralized security expansion or platform fragmentation.

## Corporate actions

Concepts requiring explicit technical support before use:

- dividends;
- stock splits;
- mergers;
- acquisitions;
- delisting;
- bankruptcy;
- rights issues;
- buybacks;
- spin-offs.

Content may describe these as planned future scope, but must not seed active mechanics that the holdings and order systems cannot represent safely.

## Market news standards

Market copy should:

- identify the material driver;
- distinguish company-specific and broad-market effects;
- avoid promising exact outcomes;
- explain uncertainty;
- avoid language resembling real investment advice;
- show both opportunity and risk;
- use consistent financial terms.

## Market validation

Before staging:

- ticker uniqueness verified;
- currency-code collision verified;
- company arithmetic verified;
- index constituents valid;
- event sensitivities complete;
- all referenced industries and countries valid;
- no unsupported corporate actions active;
- no event guarantees a profitable trade;
- company descriptions and financial profile agree;
- volatility and risk are visible to players;
- market fixtures test gain, loss, halted or unavailable data, empty holdings, and diversified holdings states.