import assert from "node:assert/strict";
import test from "node:test";

import {
  CLASS_IDS,
  COUNTRY_IDS,
  PACK_ID,
  PACK_VERSION,
  buildCountryRuntime,
  buildWorldPublication,
  publicLocationId,
  publicRouteId,
  routeMode,
  validateWorldConnectedState,
} from "./world-staging-provision-lib.mjs";

function fixture() {
  const capitalNames = {
    northreach: "frostgate",
    yrethia: "sableport",
    thaloris: "dusk-harbor",
    solvend: "aurora-spire",
    eldoran: "crescent-bay",
    valerion: "glassfall",
    lumenor: "starfall",
    xalvoria: "emberhall",
    dravenlok: "ironhold",
    syndalis: "blacklight",
  };
  const locations = COUNTRY_IDS.flatMap((country, countryIndex) =>
    Array.from({ length: 5 }, (_, locationIndex) => {
      const slug = locationIndex === 0 ? capitalNames[country] : `district-${locationIndex}`;
      return {
        id: `location.${country}.${slug}.v1`,
        country,
        name: `${country} ${slug}`,
        category: locationIndex === 0 ? "capital and port" : locationIndex === 1 ? "industrial works" : "city district",
        mapPoint: { x: 100 + countryIndex * 100 + locationIndex * 5, y: 100 + countryIndex * 40 + locationIndex * 5 },
      };
    }),
  );
  const routeModes = [
    ["rail"],
    ["maritime"],
    ["maritime"],
    ["rail"],
    ["alternate-freight"],
    ["air-freight"],
    ["road"],
    ["rail"],
    ["finance"],
    ["rail"],
    ["rail", "data"],
    ["data"],
    ["finance", "data"],
  ];
  const routes = Array.from({ length: 13 }, (_, index) => {
    const from = locations[index];
    const to = locations[index + 5];
    return {
      routeId: `route.meridian.segment-${index + 1}.v1`,
      originLocationId: from.id,
      destinationLocationId: to.id,
      modes: routeModes[index],
      geometry: { straightLinePixelLength: 120 + index * 10 },
    };
  });
  const arrivalIdentifiers = COUNTRY_IDS.map((country) =>
    `arrival-package.${country}.${capitalNames[country]}-immigrant.v1`
  );
  const downstreamContract = {
    packId: PACK_ID,
    packVersion: PACK_VERSION,
    packDigest: "a".repeat(64),
    productionAuthorized: false,
    contentIdentifiers: { arrivalPackages: { identifiers: arrivalIdentifiers } },
  };
  const profiles = COUNTRY_IDS.map((country, index) => ({
    id: `00000000-0000-4000-8${String(index).padStart(3, "0")}-000000000001`,
    country_code: country.toUpperCase(),
    currency_code: `C${String(index).padStart(2, "0")}`,
    status: "active",
  }));
  return {
    downstreamContract,
    locations: { locations },
    calibration: { routes: { routes } },
    profiles,
  };
}

test("stable public identifiers are deterministic and reject internal identities", () => {
  assert.equal(publicLocationId("location.yrethia.sableport.v1"), "loc_yrethia_sableport_v1");
  assert.equal(publicRouteId("route.meridian.northreach-solvend.v1"), "rte_meridian_northreach_solvend_v1");
  assert.throws(() => publicLocationId("00000000-0000-4000-8000-000000000001"));
});

test("route mode derivation covers reviewed transport semantics", () => {
  assert.equal(routeMode(["rail"]), "land");
  assert.equal(routeMode(["maritime", "freight"]), "sea");
  assert.equal(routeMode(["rail", "air-freight"]), "air");
  assert.equal(routeMode(["data"]), "meridian");
});

test("world publication creates exactly 50 locations, 13 routes, and all modes", () => {
  const input = fixture();
  const publication = buildWorldPublication(input);
  assert.equal(publication.locations.length, 50);
  assert.equal(publication.routes.length, 13);
  assert.equal(publication.definition.definitionDigest, `sha256:${"a".repeat(64)}`);
  assert.match(publication.publicationDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(new Set(publication.routes.map((route) => route.mode)), new Set(["land", "sea", "air", "meridian"]));
  assert.ok(publication.routes.every((route) => Number.isSafeInteger(route.baseCostMinor) && route.baseCostMinor >= 100));
  assert.ok(publication.routes.every((route) => Number.isSafeInteger(route.baseDurationMinutes) && route.baseDurationMinutes >= 30));
});

test("country runtime binds ten profiles, ten arrival packages, and eight grants", () => {
  const input = fixture();
  const runtime = buildCountryRuntime({
    downstreamContract: input.downstreamContract,
    locationRegistry: input.locations,
    countryProfiles: input.profiles,
  });
  assert.equal(runtime.countries.length, 10);
  assert.equal(runtime.classGrants.length, 8);
  assert.deepEqual(runtime.classGrants.map((grant) => grant.classId), CLASS_IDS);
  assert.ok(runtime.countries.every((country) => country.arrivalLocationId.startsWith(`loc_${country.countryId}_`)));
  assert.ok(runtime.countries.every((country) => country.arrivalPackageDefinitionId.startsWith(`arrival-package.${country.countryId}.`)));
});

test("connected verification requires complete runtime and zero assignment drift", () => {
  assert.equal(validateWorldConnectedState({
    runtimeCount: 1,
    locationCount: 50,
    routeCount: 13,
    countryCount: 10,
    grantCount: 8,
    assignmentMirror: { active_assignment_count: 1, mirrored_player_count: 1, mismatch_count: 0 },
  }), true);
  assert.throws(() => validateWorldConnectedState({
    runtimeCount: 1,
    locationCount: 50,
    routeCount: 12,
    countryCount: 10,
    grantCount: 8,
    assignmentMirror: { active_assignment_count: 1, mirrored_player_count: 1, mismatch_count: 0 },
  }), /13 World routes/);
});
