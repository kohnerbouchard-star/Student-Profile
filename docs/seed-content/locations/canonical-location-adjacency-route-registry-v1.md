# Canonical Location, Adjacency, and Route Registry v1

Status: design candidate  
Map-coordinate verification: pending  
Runtime implementation: pending  
Production authorization: false

## Purpose

Establish stable geographic identifiers for Econovaria seed content.

This registry begins with five meaningful locations per country, producing a 50-location foundation. Names, functions, and country ownership are content candidates. Exact map coordinates, border adjacency, and route geometry remain blocked until visual verification against the active map artwork.

## Location rules

Every location must have:

- stable location ID;
- country;
- display name;
- category;
- economic purpose;
- narrative purpose;
- associated industries and institutions;
- vulnerabilities;
- map-coordinate status;
- route references;
- implementation status.

A location may be used in prose before coordinates are approved, but it may not be treated as a verified map marker or route endpoint in executable content until the map review is complete.

## Northreach

| Stable ID | Name | Category | Primary role |
|---|---|---|---|
| `location.northreach.frostgate.v1` | Frostgate | capital and northern port | government, strategic resources, northern shipping, immigrant intake |
| `location.northreach.boreal-basin.v1` | Boreal Basin | mineral region | strategic mineral extraction and processing |
| `location.northreach.whiteglass-fields.v1` | Whiteglass Fields | energy region | natural gas, energy security, pipeline infrastructure |
| `location.northreach.aurora-rail-junction.v1` | Aurora Rail Junction | logistics junction | mineral and equipment transfer into the Meridian network |
| `location.northreach.kestrel-watch.v1` | Kestrel Watch | strategic chokepoint | northern-route monitoring, weather exposure, border-security pressure |

## Yrethia

| Stable ID | Name | Category | Primary role |
|---|---|---|---|
| `location.yrethia.sableport.v1` | Sableport | capital and global port | customs, shipping, insurance, freight finance, immigrant arrival |
| `location.yrethia.blue-crane-district.v1` | Blue Crane District | container district | automated cargo handling and port throughput |
| `location.yrethia.ledger-quarter.v1` | Mariner's Ledger Quarter | financial district | marine insurance, trade credit, claims, arbitration |
| `location.yrethia.tidewall-shipyards.v1` | Tidewall Shipyards | industrial port | ship repair, maintenance, and marine engineering |
| `location.yrethia.eastgate-customs-zone.v1` | Eastgate Customs Zone | customs and logistics zone | inspections, bonded transit, Meridian verification systems |

## Thaloris

| Stable ID | Name | Category | Primary role |
|---|---|---|---|
| `location.thaloris.dusk-harbor.v1` | Dusk Harbor | capital and port | repair, re-export, settlement work, flexible commerce |
| `location.thaloris.bonded-quarter.v1` | Bonded Quarter | special trade zone | warehousing, re-export, high-friction cargo handling |
| `location.thaloris.ember-yard.v1` | Ember Yard | repair district | machinery, vessel, and freight-equipment repair |
| `location.thaloris.saltwind-freeport.v1` | Saltwind Freeport | secondary port | alternate routes, small carriers, regional trade |
| `location.thaloris.breakwater-salvage-coast.v1` | Breakwater Salvage Coast | industrial coast | salvage, recycling, materials recovery, environmental risk |

## Solvend

| Stable ID | Name | Category | Primary role |
|---|---|---|---|
| `location.solvend.aurora-spire.v1` | Aurora Spire | capital and research city | universities, technology, aerospace, skilled immigration |
| `location.solvend.helix-campus.v1` | Helix Research Campus | university and research hub | AI, life sciences, advanced systems, patents |
| `location.solvend.skybridge-range.v1` | Skybridge Aerospace Range | aerospace site | testing, certification, satellite and aircraft systems |
| `location.solvend.lattice-valley.v1` | Lattice Valley | technology cluster | semiconductors, software, robotics, data infrastructure |
| `location.solvend.meridian-precision-works.v1` | Meridian Precision Works | manufacturing zone | specialized components and corridor-system equipment |

## Eldoran

| Stable ID | Name | Category | Primary role |
|---|---|---|---|
| `location.eldoran.crescent-bay.v1` | Crescent Bay | capital and market hub | commodity pricing, wholesale trade, central administration |
| `location.eldoran.greenbelt-plain.v1` | Greenbelt Grain Plain | agricultural region | staple crops, food security, harvest events |
| `location.eldoran.central-freight-junction.v1` | Central Freight Junction | rail and road junction | national and cross-country distribution |
| `location.eldoran.rivergate-market.v1` | Rivergate Wholesale Market | wholesale district | food, consumer goods, inventory, price discovery |
| `location.eldoran.sunfield-reserve.v1` | Sunfield Reserve | storage and food-security site | grain reserves, emergency release, affordability policy |

## Valerion

| Stable ID | Name | Category | Primary role |
|---|---|---|---|
| `location.valerion.glassfall.v1` | Glassfall | capital and premium-services center | clean finance, public administration, tourism, immigrant services |
| `location.valerion.silver-cascade-complex.v1` | Silver Cascade Complex | hydroelectric site | energy generation, water management, environmental conflict |
| `location.valerion.clearwater-basin.v1` | Clearwater Basin | water-security region | reservoirs, agriculture allocation, drought exposure |
| `location.valerion.verdant-finance-district.v1` | Verdant Finance District | financial district | green bonds, infrastructure finance, premium banking |
| `location.valerion.azure-coast.v1` | Azure Coast | tourism and maritime zone | hospitality, premium property, coastal infrastructure |

## Lumenor

| Stable ID | Name | Category | Primary role |
|---|---|---|---|
| `location.lumenor.starfall.v1` | Starfall | capital and civic center | education, diplomacy, media, immigrant settlement |
| `location.lumenor.meridian-forum-district.v1` | Meridian Forum District | diplomatic district | negotiation, conferences, arbitration, public demonstrations |
| `location.lumenor.civic-archive-quarter.v1` | Civic Archive Quarter | institutional district | public records, archives, verification, journalism |
| `location.lumenor.observatory-hill.v1` | Observatory Hill | research and cultural site | science, public education, international research |
| `location.lumenor.concord-university-belt.v1` | Concord University Belt | education district | universities, training, credentialing, student housing |

## Xalvoria

| Stable ID | Name | Category | Primary role |
|---|---|---|---|
| `location.xalvoria.emberhall.v1` | Emberhall | capital and finance center | banking, sovereign capital, political command, immigrant finance work |
| `location.xalvoria.sovereign-finance-district.v1` | Sovereign Finance District | financial district | infrastructure lending, funds, debt issuance, acquisitions |
| `location.xalvoria.highpass-tunnel-works.v1` | Highpass Tunnel Works | infrastructure project | rail, tunnels, Meridian construction, project finance |
| `location.xalvoria.gilded-forge-quarter.v1` | Gilded Forge Quarter | luxury manufacturing district | precision luxury production and premium exports |
| `location.xalvoria.ashen-ridge-energy-fields.v1` | Ashen Ridge Energy Fields | energy region | energy-backed finance, industrial inputs, environmental exposure |

## Dravenlok

| Stable ID | Name | Category | Primary role |
|---|---|---|---|
| `location.dravenlok.ironhold.v1` | Ironhold | capital and industrial center | factories, ministries, rail, technical immigration |
| `location.dravenlok.redline-steel-belt.v1` | Redline Steel Belt | heavy-industrial zone | steel, metals, energy-intensive production |
| `location.dravenlok.eastern-rail-works.v1` | Eastern Rail Works | transport manufacturing zone | locomotives, freight equipment, corridor supply |
| `location.dravenlok.foundry-basin.v1` | Foundry Basin | manufacturing basin | machinery, vehicles, components, labor events |
| `location.dravenlok.blackstone-industrial-port.v1` | Blackstone Industrial Port | export terminal | heavy cargo, food imports, sanctions and route exposure |

## Syndalis

| Stable ID | Name | Category | Primary role |
|---|---|---|---|
| `location.syndalis.blacklight.v1` | Blacklight | capital and digital-finance center | fintech, cybersecurity, data markets, immigrant technology work |
| `location.syndalis.cipher-district.v1` | Cipher District | cybersecurity cluster | security firms, identity systems, private intelligence |
| `location.syndalis.deepwave-cable-landing.v1` | Deepwave Cable Landing | undersea data site | international connectivity and cable-security risk |
| `location.syndalis.nightglass-data-campus.v1` | Nightglass Data Campus | data-center zone | compute, storage, energy demand, platform infrastructure |
| `location.syndalis.meridian-security-center.v1` | Meridian Security Operations Center | strategic digital site | corridor payments, customs verification, attack and recovery arc |

## Location count

- Northreach: 5
- Yrethia: 5
- Thaloris: 5
- Solvend: 5
- Eldoran: 5
- Valerion: 5
- Lumenor: 5
- Xalvoria: 5
- Dravenlok: 5
- Syndalis: 5
- Total: **50 candidate locations**

The eventual target remains 50–70. A sixth or seventh location should be added only when it supports a distinct economic, narrative, tutorial, or route purpose.

## Proposed cross-country route families

These are network concepts, not verified land-border declarations.

| Route ID | Endpoints | Mode | Economic purpose | Verification status |
|---|---|---|---|---|
| `route.meridian.northreach-solvend.v1` | Frostgate ↔ Aurora Spire | rail, freight, technical supply | minerals to advanced manufacturing | proposed |
| `route.meridian.northreach-yrethia.v1` | Frostgate ↔ Sableport | maritime and freight | resource exports and imported equipment | proposed |
| `route.meridian.yrethia-thaloris.v1` | Sableport ↔ Dusk Harbor | maritime | regulated and flexible western trade | proposed |
| `route.meridian.yrethia-eldoran.v1` | Sableport ↔ Crescent Bay | maritime and rail transfer | imports, food, wholesale distribution | proposed |
| `route.meridian.thaloris-eldoran.v1` | Dusk Harbor ↔ Crescent Bay | alternate freight | rerouting and repair-dependent commerce | proposed |
| `route.meridian.solvend-eldoran.v1` | Aurora Spire ↔ Crescent Bay | rail and air freight | components, equipment, food, professional services | proposed |
| `route.meridian.eldoran-valerion.v1` | Crescent Bay ↔ Glassfall | rail, road, energy | food, water, clean energy, consumer trade | proposed |
| `route.meridian.valerion-lumenor.v1` | Glassfall ↔ Starfall | rail and civic corridor | energy, education, diplomacy, tourism | proposed |
| `route.meridian.lumenor-xalvoria.v1` | Starfall ↔ Emberhall | rail and finance | Forum access, capital, professional services | proposed |
| `route.meridian.xalvoria-dravenlok.v1` | Emberhall ↔ Ironhold | rail and infrastructure | finance, machinery, construction, public debt | proposed |
| `route.meridian.dravenlok-syndalis.v1` | Ironhold ↔ Blacklight | rail and data | industrial systems, components, security | proposed |
| `route.meridian.syndalis-lumenor.v1` | Blacklight ↔ Starfall | undersea or terrestrial data | communications, media, public records | proposed |
| `route.meridian.xalvoria-syndalis.v1` | Emberhall ↔ Blacklight | finance and data | capital markets, payments, identity services | proposed |

## Adjacency policy

Country polygons must not be used as authoritative adjacency logic.

A future adjacency record must declare:

- country pair;
- adjacency type: land, maritime, near-maritime, route-connected, or none;
- verified map evidence;
- border-crossing locations;
- normal movement rules;
- wartime movement rules;
- customs relationship;
- active route references;
- review status.

No land-border claim is approved by this first registry.

## Meridian segment requirements

Every executable Corridor segment must define:

- stable segment ID;
- two or more verified location endpoints;
- mode;
- owner and operator institutions;
- capacity class;
- normal utilization;
- critical commodities and industries;
- dependency routes;
- vulnerability class;
- attack and outage behavior;
- repair requirements;
- economic effects;
- news and interaction references;
- map representation;
- technical support status.

## Map-marker semantics

Recommended future map behavior:

- country centroid marker: country-selection control;
- capital marker: separate labeled location marker;
- economic-site marker: shown only at appropriate zoom or location view;
- route line: rendered only from verified route registry;
- disruption marker: runtime instance referencing a stable location or segment.

The current Player Terminal marker must not be described as a capital until the renderer uses the stored capital point.

## Immediate next actions

1. Review all 50 names against country canon and representation standards.
2. Assign candidate map points within the verified country polygons.
3. Inspect the active PNG and confirm terrain, coastlines, and visual compatibility.
4. Correct stale Lumenor and Xalvoria map profiles in a Player-owned tranche.
5. Confirm route modes and country adjacency.
6. Convert approved locations and routes into machine-readable records.
7. Replace free-text Contract and event locations with stable IDs.

## Validation blockers

- exact coordinates are missing;
- country adjacency is unverified;
- route geometry is unverified;
- the active map artwork has not completed pixel-level review;
- location names have not completed final naming review;
- no runtime location schema has been approved.
