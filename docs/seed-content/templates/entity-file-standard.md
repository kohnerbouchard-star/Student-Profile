# One-Entity File Standard

Status: required for pilot and later production catalogs

## Purpose

Every production-targeted content entity should live in its own file. This improves search, review ownership, diffs, deprecation, versioning, and eventual conversion into machine-readable seed records.

## Directory convention

Recommended structure:

- `countries/<slug>.md`
- `institutions/<country-or-global>/<slug>.md`
- `characters/<country>/<slug>.md`
- `companies/<country>/<slug>.md`
- `story-arcs/<scope>/<slug>.md`
- `events/<arc-or-family>/<slug>.md`
- `interactions/<arc-or-family>/<slug>.md`
- `contracts/<chain-or-family>/<slug>.md`
- `items/<category>/<slug>.md`
- `bank-products/<country-or-global>/<slug>.md`
- `achievements/<category>/<slug>.md`
- `locations/<country>/<slug>.md`
- `tutorials/<slug>.md`
- `notifications/<category>/<slug>.md`

## Required header

Each file begins with:

- title;
- stable content ID;
- content type;
- version;
- maturity status;
- owner domain;
- country or global scope;
- scenario compatibility;
- canonical references;
- implementation status.

## Required sections for all entities

1. Purpose
2. Player-facing summary
3. Admin or design rationale
4. Dependencies
5. Availability or trigger
6. Lifecycle
7. Economic effects
8. Narrative effects
9. Learning objective where applicable
10. Failure, expiry, cancellation, or retirement behavior
11. Asset requirements
12. Validation rules
13. Open technical questions
14. Review status
15. Change log

## Cross-reference syntax

Use stable IDs in prose where precision matters.

Example:

- Story arc: `story-arc.global.meridian-corridor.v1`
- Institution: `institution.lumenor.starfall-meridian-forum.v1`
- Event: `event.meridian.customs-security-intrusion.v1`

Display names may accompany IDs, but never replace them as canonical references.

## Maturity status

- concept;
- draft;
- reviewed;
- approved;
- staging-ready;
- production-ready;
- deprecated;
- retired.

## Review block

Every entity file ends with a review block:

- economic review: pending, passed, changes required, not applicable;
- narrative review: pending, passed, changes required, not applicable;
- gameplay and learning review: pending, passed, changes required, not applicable;
- technical compatibility review: pending, passed, changes required;
- blocking findings;
- nonblocking improvements;
- reviewer date or tranche reference.

## Machine-conversion readiness

A file is ready for later conversion when:

- stable ID is final;
- all referenced IDs exist;
- required values have units and currencies;
- lifecycle states map to authoritative contracts;
- copy is separated from design notes;
- effects use controlled vocabulary or approved numeric fields;
- unsupported concepts are explicitly marked;
- no runtime IDs or session-specific values are embedded in reusable definitions.