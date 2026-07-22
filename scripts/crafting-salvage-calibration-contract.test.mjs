import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const simulation = await readFile(
  new URL("./simulate-physical-economy-balance.mjs", import.meta.url),
  "utf8",
);

test("salvage ceiling uses immutable calibration value without weakening recraft protection", () => {
  assert.match(simulation, /outputEconomicsComplete/);
  assert.match(simulation, /economics\.salvageValue/);
  assert.match(simulation, /recoveredSalvageValue\s*<=\s*capValue\s*\+\s*0\.01/);
  assert.match(simulation, /recoveredReferenceValue\s*<\s*sourceInputValue/);
  assert.doesNotMatch(simulation, /recoveredReferenceValue\s*<=\s*capValue/);
});
