# Narrative Continuity and Choice Review v1

Review status: changes required
Scope reviewed: world timeline, country files, institutions, lead characters, Meridian arc, contracts, events
Review perspective: narrative architecture, continuity, agency, and representation

## Executive finding

The foundation has a strong non-linear narrative model and avoids treating story as flavor text. Country tensions are differentiated, lead characters have bounded authority, and the Meridian arc supports four plausible outcomes. It is not yet continuity-complete because resolution selection, interaction branches, supporting character diversity, and cross-arc conflict rules remain unfinished.

## Strengths

### N-S01: Story follows economic causality

The arc connects infrastructure, capacity, food, energy, resources, labor, finance, and data rather than introducing unrelated dramatic events.

### N-S02: Countries have interests rather than moral alignments

- Xalvoria’s finance can accelerate real development and create dependency risk.
- Thaloris provides legitimate repair and resilience while facing compliance risk.
- Syndalis provides effective security while creating access and trust concerns.
- Lumenor provides legitimacy but may impose delay.

This is appropriate and should be preserved.

### N-S03: Character authority is bounded

The lead-character files distinguish institutional knowledge from hidden player information, intelligence, and unsupported powers.

### N-S04: Failure creates continuation

Suspension, fragmented development, failed security response, and inaccurate forecasts all have recovery or follow-up paths.

### N-S05: News fact status is explicit

Forecast, confirmed condition, allegation, attribution, and correction are treated separately.

## Blocking findings

### N-01: Meridian resolution algorithm undefined

Severity: blocking for runtime narrative

The arc lists four resolutions but does not define how a session reaches each one.

Required design:

- decision variables;
- minimum and maximum values;
- instructor versus player contribution;
- tie behavior;
- default resolution;
- cancellation behavior;
- audit explanation visible to Admin;
- whether results are deterministic or probabilistic.

The outcome must not be selected arbitrarily after player actions are known.

### N-02: Interaction trees are not yet instantiated

Severity: blocking for narrative pilot

The framework defines interactions, but the ten lead interactions do not yet exist as separate records.

Required:

- opening message;
- two to four responses;
- immediate reply;
- economic and narrative effects;
- knowledge and authority checks;
- expiry and no-response behavior;
- follow-up references.

### N-03: Supporting perspectives incomplete

Severity: major

Each country file proposes additional worker, community, media, consumer, research, or accountability voices, but only one lead character per country has a standalone record.

Required before country production approval:

- minimum two recurring perspectives per country;
- no country represented only by government or senior management;
- worker, consumer, community, independent media, academic, or public-interest coverage.

### N-04: Character and location naming review pending

Severity: major

Names are working concepts. A consistency and phonetic review is required to avoid accidental similarity, cultural coding, or repeated naming patterns.

### N-05: Cross-arc concurrency rules absent

Severity: major

Required rules:

- which global arcs can run together;
- which country arcs pause during global crisis;
- event priority;
- duplicate topic suppression;
- contradiction detection;
- whether an arc can supersede or merge with another.

### N-06: Arc stage cancellation and rollback incomplete

Severity: major

The arc has cancellation concepts but needs stage-specific treatment for:

- delivered interactions;
- accepted contracts;
- scheduled delayed effects;
- active events;
- notifications;
- player recommendations.

### N-07: Historical timeline lacks explicit relative chronology

Severity: moderate

The timeline is ordered but not labeled by era distance. Add fictional year or relative period labels sufficient to prevent contradictory character references.

## Choice-quality findings

### N-C01: Major choices are genuinely distinct

Pass.

### N-C02: Security decision risks one apparent compromise optimum

The “technical assistance with independent oversight” option may read as an obvious best-of-both-worlds selection.

Required correction:

Make its additional staffing, coordination delay, limited access, and possible containment weakness explicit enough that broader access, federation, manual fallback, and suspension remain defensible.

### N-C03: Hybrid governance risks automatic superiority

Contract guidance correctly says hybrid is not automatically better. Preserve this in all interactions and resolution scoring.

### N-C04: No-response consequences need design

A decision window must define what happens when a player or group does not answer. No response should not silently map to the most punitive option.

## Representation and classroom findings

### N-R01: Stereotype avoidance is explicitly addressed

Pass at concept level.

### N-R02: Real-world analogy references should remain internal design notes

Existing lore includes real-world logic references. Player-facing files should not present fictional countries as one-to-one copies of real countries.

### N-R03: Cyber, food, labor, sanctions, and debt stories require continued sensitivity review

Pass with ongoing review required.

## Required next work

1. Create the ten Meridian interaction files.
2. Define resolution variables and deterministic selection rules.
3. Add supporting character records.
4. Add relative dates to the historical timeline.
5. Define cross-arc concurrency and cancellation.
6. Create news files for introduction, warnings, crisis, correction, and resolution.
7. Re-review character names and voices after full interaction copy exists.

## Approval gate

Narrative pilot approval remains blocked by N-01 and N-02. Country-level narrative approval remains blocked by N-03 and N-04.