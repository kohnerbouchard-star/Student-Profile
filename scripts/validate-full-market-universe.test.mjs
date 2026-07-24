import assert from "node:assert/strict";
import test from "node:test";

import {
  EXPECTED_TOTAL_INSTRUMENTS,
  validateFullMarketUniverse,
  validateInstrumentRecord,
} from "./validate-full-market-universe.mjs";

test("committed full market universe is deterministic, complete, and inactive", async () => {
  const first = await validateFullMarketUniverse();
  const second = await validateFullMarketUniverse();

  assert.equal(first.valid, true, JSON.stringify(first.errors, null, 2));
  assert.equal(first.counts.instruments, EXPECTED_TOTAL_INSTRUMENTS);
  assert.equal(first.counts.countries, 10);
  assert.equal(first.activationAuthorized, false);
  assert.equal(first.productionAuthorized, false);
  assert.deepEqual(first, second);
});

test("instrument validation rejects activation and cross-country allocation drift", () => {
  const errors = [];
  const warnings = [];
  validateInstrumentRecord(
    {
      id: "instrument.northreach.common_equity.9999.v1",
      symbol: "NRTST",
      name: "Northreach Test Infrastructure Common",
      country: "solvend",
      currency: "SLV",
      exchange: "AUX",
      instrumentType: "common_equity",
      assetClass: "equity",
      sector: "infrastructure",
      issuerId: "issuer.northreach.corporate.9999.v1",
      issuerName: "Northreach Test Infrastructure",
      seedStatus: "design-candidate",
      runtimeSupport: "unverified",
      activationAuthorized: true,
      narrativeTags: ["infrastructure"],
      __sourceCountry: "northreach",
      __sourceLine: 1,
      __sourceFile: "universe/northreach.jsonl",
    },
    "northreach",
    { currency: "NRC", exchange: "FGX" },
    errors,
    warnings,
  );

  const codes = new Set(errors.map((entry) => entry.code));
  assert.equal(codes.has("country_mismatch"), true);
  assert.equal(codes.has("currency_mismatch"), true);
  assert.equal(codes.has("exchange_mismatch"), true);
  assert.equal(codes.has("activation_not_disabled"), true);
});

test("instrument validation rejects unsupported and mismatched asset types", () => {
  const errors = [];
  const warnings = [];
  validateInstrumentRecord(
    {
      id: "instrument.northreach.derivative.0001.v1",
      symbol: "NRDRV",
      name: "Northreach Unsupported Contract",
      country: "northreach",
      currency: "NRC",
      exchange: "FGX",
      instrumentType: "derivative",
      assetClass: "fixed_income",
      sector: "financial-services",
      issuerId: "issuer.northreach.corporate.0001.v1",
      issuerName: "Northreach Capital",
      seedStatus: "design-candidate",
      runtimeSupport: "unverified",
      activationAuthorized: false,
      narrativeTags: ["financial-services"],
      __sourceCountry: "northreach",
      __sourceLine: 1,
      __sourceFile: "universe/northreach.jsonl",
    },
    "northreach",
    { currency: "NRC", exchange: "FGX" },
    errors,
    warnings,
  );

  assert.equal(
    errors.some((entry) => entry.code === "unsupported_instrument_type"),
    true,
  );
});
