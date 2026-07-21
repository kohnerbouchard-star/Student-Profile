# Character Rename Reference Validation v1

Status: active catalog validation gate
Owner domain: narrative canon and content release
Applies to: foundation content pack and Meridian pilot

## Purpose

Prevent retired pre-release character names and stable IDs from entering a design manifest, staging package, asset bundle, fixture, or production content pack.

## Canonical replacements

| Retired draft | Retired stable ID | Canonical character | Canonical stable ID |
|---|---|---|---|
| Eren Vale | `character.eldoran.eren-vale.v1` | Eren Calder | `character.eldoran.eren-calder.v1` |
| Sola Merin | `character.valerion.sola-merin.v1` | Talia Quen | `character.valerion.talia-quen.v1` |
| Dena Sol | `character.lumenor.dena-sol.v1` | Dena Holt | `character.lumenor.dena-holt.v1` |
| Sera Noll | `character.thaloris.sera-noll.v1` | Maelin Noll | `character.thaloris.maelin-noll.v1` |

## Canonical character files

- `characters/eldoran/eren-calder.md`;
- `characters/valerion/talia-quen.md`;
- `characters/lumenor/dena-holt.md`;
- `characters/thaloris/maelin-noll.md`.

## Retired files

The old filenames remain only as pre-release tombstones during the draft PR.

They must be classified as:

- non-loadable;
- excluded from record counts;
- excluded from asset generation;
- excluded from Player and Admin copy;
- excluded from fixtures;
- excluded from stable-ID exports.

They are not compatibility aliases because no released pack used the old identifiers.

## Updated authority references

The following institution records now point to the canonical IDs:

- Eldoran Consumer Price Council → Eren Calder;
- Valerion Public Water Access Office → Talia Quen;
- Starfall Public Media Trust → Dena Holt;
- Thaloris Trade Legitimacy Commission → Maelin Noll.

## Required reference sweep

Before a design manifest can be marked complete, search all files under `docs/seed-content/**` for the following exact tokens:

- `Eren Vale`;
- `eren-vale`;
- `character.eldoran.eren-vale.v1`;
- `Sola Merin`;
- `sola-merin`;
- `character.valerion.sola-merin.v1`;
- `Dena Sol`;
- `dena-sol`;
- `character.lumenor.dena-sol.v1`;
- `Sera Noll`;
- `sera-noll`;
- `character.thaloris.sera-noll.v1`.

Permitted matches:

- the four retired tombstone files;
- the naming and pronunciation review describing the historical draft issue;
- this validation file;
- a release note that explicitly identifies the pre-release rename.

Every other match is a blocking error.

## Domains requiring explicit verification

- country design catalogs;
- student country briefings;
- institution records;
- recurring-character catalog;
- global catalog index;
- Meridian outcome reaction matrix;
- news reports;
- interactions;
- events;
- Contracts and rubrics;
- world chronology;
- asset manifests and portrait filenames;
- accessibility labels and alt text;
- test and staging fixtures;
- generated design manifest.

## Validation output

The final validation report records:

- token searched;
- matching path;
- line number;
- permitted or blocking classification;
- replacement applied;
- reviewer;
- source commit;
- zero-blocking-reference result.

## Staging gate

A staging manifest must fail when:

- any retired stable ID appears in a loadable record;
- any canonical record references a retired character;
- a portrait or asset filename uses the retired slug;
- a country briefing presents the retired display name;
- the catalog contains both old and new records as active concepts;
- a generated record count includes tombstones.

## Production decision

The four new names are approved for the foundation draft.

Naming canon remains conditionally blocked until the zero-blocking-reference sweep is complete. No database migration is required because the changes occurred before release.