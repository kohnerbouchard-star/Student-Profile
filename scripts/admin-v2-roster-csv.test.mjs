import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkRosterCsv, ROSTER_CSV_HEADERS, ROSTER_CSV_MAX_BYTES } from "../admin/v2/src/routes/players/roster-csv.js";

const header = ROSTER_CSV_HEADERS.join(",");
const csv = (...rows) => [header, ...rows].join("\n");

test("normalizes IDs, preserves names, allows optional labels, BOM and CRLF", () => {
  const checked = checkRosterCsv(`\uFEFF${header}\r\n김하늘,,card-1\r\n"Doe, Avery",Class A,card:2\r\n`);
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.rows, [
    { row: 2, displayName: "김하늘", rosterLabel: "", playerIdentifier: "CARD-1" },
    { row: 3, displayName: "Doe, Avery", rosterLabel: "Class A", playerIdentifier: "CARD:2" },
  ]);
});

test("accepts escaped quotes without treating markup or formulas as code", () => {
  assert.equal(checkRosterCsv(csv('"Avery ""Ace"" Doe",=1+2,CARD-1')).rows[0].displayName, 'Avery "Ace" Doe');
  assert.equal(checkRosterCsv(csv('<img src=x onerror=alert(1)>,,CARD-1')).ok, true);
});

for (const [name, source] of [
  ["empty", ""], ["header-only", header], ["missing header", "Avery,A,CARD-1"],
  ["extra column", `${header},access_code\nAvery,A,CARD-1,PRIVATE-MARKER`],
  ["reordered columns", "player_identifier,display_name,roster_label\nCARD-1,Avery,A"],
  ["duplicate header", "display_name,display_name,player_identifier\nAvery,A,CARD-1"],
  ["unknown header", "display_name,PRIVATE-MARKER,player_identifier\nAvery,A,CARD-1"],
  ["missing field", csv("Avery,CARD-1")], ["extra field", csv("Avery,A,CARD-1,PRIVATE-MARKER")],
  ["unterminated quote", csv('"Avery,A,CARD-1')], ["unquoted quote", csv('Av"ery,A,CARD-1')],
  ["text after quote", csv('"Avery"x,A,CARD-1')], ["blank row", csv("Avery,A,CARD-1", "", "Blair,B,CARD-2")],
]) {
  test(`rejects ${name} without returning partial rows or echoing input`, () => {
    const result = checkRosterCsv(source);
    assert.equal(result.ok, false);
    assert.deepEqual(result.rows, []);
    assert.ok(result.errors.length);
    assert.doesNotMatch(JSON.stringify(result.errors), /PRIVATE-MARKER/);
  });
}

test("rejects case-insensitive duplicate IDs and points at the first data row", () => {
  const result = checkRosterCsv(csv("Avery,A,card-1", "Blair,B,CARD-1"));
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.errors, [{ row: 3, message: "Player ID duplicates row 2 in this file." }]);
});

test("duplicate names are not mistaken for identity matches", () => {
  assert.equal(checkRosterCsv(csv("Avery,A,CARD-1", "Avery,A,CARD-2")).ok, true);
});

test("validates every row, lengths, controls and credential format", () => {
  for (const row of [",A,CARD-1", `${"a".repeat(241)},A,CARD-1`, `Avery,${"x".repeat(241)},CARD-1`,
    "Avery,A,", `Avery,A,${"X".repeat(129)}`, "Avery,A,CARD 1", "Avery,A,CARD@1",
    "Av\u0000ery,A,CARD-1", "Avery,\u202eA,CARD-1", '"Avery\nDoe",A,CARD-1',
    "Avery,\ufffd,CARD-1", "Avery,A,10000000-0000-4000-8000-000000000001"]) {
    assert.equal(checkRosterCsv(csv(row)).ok, false, row);
  }
  assert.equal(checkRosterCsv(csv(`${"a".repeat(240)},${"b".repeat(240)},${"C".repeat(128)}`)).ok, true);
});

test("bounds bytes and rows including non-ASCII UTF-8", () => {
  assert.equal(checkRosterCsv("a".repeat(ROSTER_CSV_MAX_BYTES + 1)).ok, false);
  assert.match(checkRosterCsv("한".repeat(50_000)).errors[0].message, /128 KiB/);
  const rows = Array.from({ length: 200 }, (_, i) => `Player ${i},,CARD-${i}`);
  assert.equal(checkRosterCsv(csv(...rows)).rows.length, 200);
  assert.equal(checkRosterCsv(csv(...rows, "Extra,,CARD-EXTRA")).ok, false);
  assert.equal(checkRosterCsv(csv(...rows, "Extra,,CARD-EXTRA", "")).ok, false);
});

test("readiness UI and existing import denial stay explicitly non-operational", () => {
  const review = readFileSync(new URL("../admin/v2/src/routes/players/RosterCsvReview.js", import.meta.url), "utf8");
  assert.match(review, /Import unavailable/);
  assert.match(review, /Existing-roster conflicts have not been checked/);
  assert.doesNotMatch(review, /\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage|indexedDB|createPlayer)\b/);
  const unsupported = readFileSync(new URL("../backend/supabase/functions/admin-api/unsupportedOperations.ts", import.meta.url), "utf8");
  assert.match(unsupported, /roster_csv_import_not_configured/);
});
