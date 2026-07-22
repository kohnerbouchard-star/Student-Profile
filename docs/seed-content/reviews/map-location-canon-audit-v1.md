# Map Location and Canon Audit v1

Status: completed structural audit; visual-art verification still required
Audit date: 2026-07-18
Scope: current Player Terminal world map, country overlay geometry, canonical country identities, capitals, bloc placement, and new immigrant-opening locations
Runtime changes authorized: none

## Executive finding

The current map is structurally usable and the broad country placement is consistent with the authoritative economic-bloc design.

The map is not yet canon-clean.

The country polygons, IDs, capital names, and broad north/west/central/east layout are coherent. However, the map data still contains stale country-profile content for Lumenor and Xalvoria, the visible map marker represents a country centroid rather than the stored capital point, old background-image references remain in the geometry metadata, and the runtime map has no city, port, corridor, border-crossing, or infrastructure-node registry.

The new immigrant openings use the correct ten primary cities, but their terminals, districts, corridors, ports, institutions, and wartime routes cannot yet be spatially verified or displayed.

## Sources reviewed

- `player-terminal/assets/map/country-regions.json`
- `player-terminal/src/data/map-regions.js`
- `player-terminal/src/pages/dashboard-page.js`
- `player-terminal/css/player-terminal-polish.css`
- `player-terminal/UI_MAP_PASS.md`
- `player-terminal/MAP_OVERLAY_FIX.md`
- `docs/worldbuilding/econovaria-country-lore-v1.md`
- `docs/seed-content/story-arcs/countries/README.md`
- the ten country immigrant-opening definitions

## Coordinate and rendering validation

The map and overlay use the same `1672 × 941` coordinate space.

The dashboard map container preserves that aspect ratio. The image and SVG overlay both occupy the full container, and the image uses `object-fit: contain` with centered positioning. This is the correct structural approach for maintaining polygon-to-image alignment across responsive layouts.

The overlay contains ten country regions and uses the same polygon geometry imported from the earlier interactive-map reference package.

No structural evidence was found that the SVG overlay is being stretched independently from the map image.

## Canonical placement result

| Country | Coordinate-derived placement | Canonical geographic/economic role | Result |
|---|---|---|---|
| Northreach | northwest / far north | arctic resources and northern logistics | aligned |
| Yrethia | western coast / west-central | regulated maritime trade and port finance | aligned |
| Thaloris | southwest / southern western coast | flexible port, repair, salvage, and re-export economy | aligned |
| Solvend | north-central | high-altitude research and technology state | aligned |
| Eldoran | geographic center | agricultural-logistics and commodity-pricing anchor | aligned |
| Valerion | south-central | water, clean energy, finance, and premium services | aligned |
| Lumenor | far south / southern central region | southern education, diplomacy, media, and civic-legitimacy state | geographic placement aligned; profile metadata stale |
| Xalvoria | northeast | mountainous old-money financial and infrastructure power | geographic placement aligned; profile metadata stale |
| Dravenlok | east-central | heavy industry, steel, machinery, and defense production | aligned |
| Syndalis | southeast | cybersecurity, fintech, data routes, and undersea-cable influence | aligned at broad level |

## Capital-name validation

All ten map records use the same primary cities as the authoritative lore and the immigrant-opening index:

1. Northreach — Frostgate
2. Yrethia — Sableport
3. Thaloris — Dusk Harbor
4. Solvend — Aurora Spire
5. Eldoran — Crescent Bay
6. Valerion — Glassfall
7. Lumenor — Starfall
8. Xalvoria — Emberhall
9. Dravenlok — Ironhold
10. Syndalis — Blacklight

No capital-name mismatch was found.

## Finding 1: visible markers are not capital markers

Severity: high for geographic semantics; low for current country-selection behavior

`country-regions.json` stores a `capitalPoint` for each country.

The runtime overlay data in `src/data/map-regions.js` omits `capitalPoint`, and the dashboard renders the circular marker using `region.centroid`.

Therefore:

- the marker is a country-center marker, not a capital marker;
- capital coordinates are currently dead data;
- a user may reasonably misinterpret the marker as the capital;
- story locations cannot use the marker as spatial evidence.

Required decision:

- either explicitly label the marker as a country-selection centroid;
- or carry `capitalPoint` into the runtime geometry model and render a separate capital marker;
- or render both country centroid and capital using visually distinct symbols.

Recommended direction:

Use the current centroid only as the invisible focus/hit reference. Render the capital from `capitalPoint` with a small labeled capital symbol.

## Finding 2: Lumenor profile metadata is attached to obsolete canon

Severity: blocking for map intelligence and future seeded content

The current map data describes Lumenor as:

- a southern platform and orbital-logistics economy;
- launch platforms;
- data relays;
- ocean engineering;
- cold-chain ports;
- a maritime island economy with fisheries and tourism.

The authoritative lore defines Lumenor as:

- a southern cultural and education economy;
- a diplomatic and arbitration center;
- a public-administration and media state;
- a center of universities, archives, observatories, civic institutions, and international conferences.

The southern placement is compatible with current canon. The attached economic profile, sector data, intelligence copy, and market-research content are not.

Required correction:

Replace Lumenor map profile content while preserving the region polygon, country ID, color, capital, centroid, and capital point unless visual review shows a geographic problem.

Potential secondary sectors such as southern ports, observatories, relay systems, and cold-chain access may remain only if they are subordinated to the approved education, diplomacy, media, and civic-legitimacy identity.

## Finding 3: Xalvoria profile metadata overlaps Dravenlok

Severity: blocking for map intelligence and country differentiation

The current map data describes Xalvoria primarily as:

- an industrial energy and manufacturing bloc;
- metallurgy;
- heavy manufacturing;
- factory utilization;
- high-output urban production.

That identity materially overlaps Dravenlok.

The authoritative Xalvoria identity is:

- old-money banking and capital markets;
- infrastructure finance;
- sovereign wealth;
- luxury manufacturing;
- energy-backed lending;
- cross-border ownership and political influence;
- mountainous financial and political command centers.

The northeast/mountain-region placement remains plausible. The attached profile, sectors, fallback indicators, intelligence, and market-research copy require reconciliation.

Required correction:

Preserve the polygon and capital placement, but replace the industrial-primary identity with finance, infrastructure ownership, energy-backed capital, sovereign investment, luxury production, and dependency risk.

## Finding 4: obsolete background-image metadata remains

Severity: medium maintenance risk; not a current rendering failure

`country-regions.json` references older image names:

- `./assets/econovaria-cyberpunk-map-source-1672x941.png`
- `./assets/econovaria-cyberpunk-map-4k.jpg`

The active dashboard does not use those fields. It renders:

- `./assets/images/econovaria-world-map.png`

This creates two competing map-asset references and makes future tooling likely to load the wrong file.

Required correction:

Choose one authoritative asset registry and remove or update obsolete image fields.

## Finding 5: no spatial registry exists below country level

Severity: blocking for location-aware story implementation

The current runtime map renders:

- country polygons;
- country borders;
- one centroid marker per country.

It does not render or authoritatively register:

- capitals;
- secondary cities;
- ports;
- airports;
- rail terminals;
- border crossings;
- resource basins;
- water systems;
- research districts;
- diplomatic districts;
- industrial belts;
- data routes;
- sea lanes;
- Meridian Corridor segments;
- attack sites;
- refugee or evacuation routes.

The new immigrant openings introduce specific places such as terminals, diplomatic districts, housing zones, industrial facilities, and transport corridors. These names are narratively usable but not yet map-verifiable.

Required correction:

Create a canonical location registry before executable story content is approved.

Minimum proposed location fields:

- stable location ID;
- display name;
- country ID;
- location type;
- map point or polygon;
- parent location;
- coastal, inland, border, island, mountain, or river classification;
- connected routes;
- economic functions;
- story functions;
- public visibility;
- implementation status;
- validation status.

## Finding 6: no canonical adjacency and route model exists

Severity: blocking for war, trade, migration, and Meridian route logic

The broad map layout supports the intended blocs, but no authoritative record currently states:

- which countries share land borders;
- which are separated by water;
- which ports connect directly;
- which rail and road routes exist;
- which routes form the Meridian Corridor;
- which routes close during war;
- which alternate routes are available;
- how long movement should take;
- which countries control chokepoints.

Polygon proximity must not be used as an implicit gameplay rule.

Required correction:

Create a route and adjacency registry independent from visual polygon geometry.

## Immigrant-opening validation

The ten country openings use the correct primary cities and are broadly consistent with each country’s map position.

Confirmed broad geographic fit:

- Frostgate as a northern strategic terminal;
- Sableport and Dusk Harbor as western maritime gateways;
- Aurora Spire as a northern/high-altitude research center;
- Crescent Bay as the central market and distribution anchor;
- Glassfall as a south-central water and clean-energy center;
- Starfall as a southern neutral conference and institutional capital;
- Emberhall as a northeastern mountainous financial capital;
- Ironhold as an eastern industrial capital;
- Blacklight as a southeastern data and financial-routing capital.

The invented sublocations remain provisional until the location registry exists.

## Visual-art verification still required

This audit verified text, coordinates, polygons, renderer behavior, and canon.

The binary map artwork itself still requires a human or image-capable visual pass to confirm:

- whether country labels are positioned inside the correct borders;
- whether capital labels match the stored capital points;
- whether industrial, agricultural, maritime, mountain, water, and city imagery appears in the intended countries;
- whether obsolete Lumenor orbital/island art remains visible;
- whether obsolete Xalvoria heavy-industry art remains visible;
- whether coastlines support the stated ports and undersea-data routes;
- whether any decorative overlays imply incorrect borders or ownership.

No claim is made that these pixel-level checks passed.

## Required correction order

1. Lock the ten country polygons and broad placement unless visual review finds a border defect.
2. Decide whether visible markers represent centroids, capitals, or both.
3. Correct Lumenor profile and sector metadata.
4. Correct Xalvoria profile and sector metadata.
5. Remove or update obsolete background-image references.
6. Create the canonical location registry.
7. Create the adjacency and route registry.
8. Map the Meridian Corridor, attack site, ports, terminals, and wartime route changes.
9. Run visual verification against the actual PNG at desktop, tablet, and mobile sizes.
10. Only then convert location-dependent story content into executable records.

## Approval status

- country polygon layout: conditionally accepted
- broad country placement: accepted
- capital names: accepted
- capital marker behavior: not accepted
- Lumenor map profile: rejected pending correction
- Xalvoria map profile: rejected pending correction
- sublocation correctness: unverified
- Meridian route correctness: unverified
- visual artwork correctness: unverified
- executable location content: blocked
