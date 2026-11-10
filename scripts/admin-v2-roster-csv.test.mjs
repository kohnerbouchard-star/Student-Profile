import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkRosterCsv, ROSTER_CSV_HEADERS, ROSTER_CSV_MAX_BYTES } from "../admin/v2/src/routes/players/roster-csv.js";

const header = ROSTER_CSV_HEADERS.join(",");
const csv = (...rows) => [header, ...rows].join("\n");

test("accepts names alone with no heading, identifiers, or credentials", () => {
  assert.deepEqual(checkRosterCsv('김하늘\n"Doe, Avery"').rows, [
    { row: 1, displayName: "김하늘" }, { row: 2, displayName: "Doe, Avery" },
  ]);
});

test("recognizes optional name headings, BOM, CRLF and canonical Unicode", () => {
  for (const label of [header, "Name", "Student name", "display_name"]) {
    const result = checkRosterCsv(`\uFEFF${label}\r\n 김하늘 \r\nAme\u0301lie\r\n`);
    assert.equal(result.ok, true);
    assert.equal(result.headerSkipped, true);
    assert.deepEqual(result.rows, [{ row: 2, displayName: "김하늘" }, { row: 3, displayName: "Amélie" }]);
  }
});

test("explicit header choices resolve ambiguity without dropping a student", () => {
  assert.deepEqual(checkRosterCsv("Name\nAvery", { headerMode: "absent" }).rows,
    [{ row: 1, displayName: "Name" }, { row: 2, displayName: "Avery" }]);
  assert.deepEqual(checkRosterCsv("Class roster\nAvery", { headerMode: "present" }).rows,
    [{ row: 2, displayName: "Avery" }]);
  assert.equal(checkRosterCsv("Avery", { headerMode: "invalid" }).ok, false);
});

test("accepts escaped quotes without interpreting markup or formulas", () => {
  assert.equal(checkRosterCsv(csv('"Avery ""Ace"" Doe"')).rows[0].displayName, 'Avery "Ace" Doe');
  for (const name of ["<img src=x onerror=alert(1)>", "=1+2", "+Avery", "@Name"]) {
    assert.equal(checkRosterCsv(csv(name)).rows[0].displayName, name);
  }
});

for (const [name, source] of [
  ["empty", ""], ["heading only", header],
  ["extra column", `${header},access_code\nAvery,PRIVATE-MARKER`],
  ["legacy identifiers", "display_name,roster_label,player_identifier\nAvery,A,CARD-1"],
  ["trailing extra field", csv("Avery,")], ["extra field", csv("Avery,PRIVATE-MARKER")],
  ["unterminated quote", csv('"Avery')], ["unquoted quote", csv('Av"ery')],
  ["text after quote", csv('"Avery"x')], ["blank interior row", csv("Avery", "", "Blair")],
]) {
  test(`rejects ${name} without partial rows or echoing input`, () => {
    const result = checkRosterCsv(source);
    assert.equal(result.ok, false);
    assert.deepEqual(result.rows, []);
    assert.ok(result.errors.length);
    assert.doesNotMatch(JSON.stringify(result.errors), /PRIVATE-MARKER/);
  });
}

test("repeated names stay separate ordered students, never identity matches", () => {
  const result = checkRosterCsv(csv("Avery", "Avery", "avery"));
  assert.equal(result.ok, true);
  assert.equal(result.duplicateNameCount, 2);
  assert.deepEqual(result.rows.map(({ displayName }) => displayName), ["Avery", "Avery", "avery"]);
});

test("validates name lengths, controls, UUIDs and invalid UTF-8", () => {
  for (const name of [" ", "a".repeat(241), "Av\u0000ery", "\u202eAvery", '"Avery\nDoe"',
    "Avery\ufffd", "Avery\ud800", "Avery\udc00", "10000000-0000-4000-8000-000000000001"]) {
    assert.equal(checkRosterCsv(csv(name)).ok, false, name);
  }
  assert.equal(checkRosterCsv(csv("a".repeat(240))).ok, true);
  assert.equal(checkRosterCsv(csv("𐐀very")).ok, true);
});

test("bounds bytes and student counts with and without optional heading", () => {
  assert.equal(checkRosterCsv("a".repeat(ROSTER_CSV_MAX_BYTES + 1)).ok, false);
  assert.match(checkRosterCsv("한".repeat(50_000)).errors[0].message, /128 KiB/);
  const rows = Array.from({ length: 200 }, (_, i) => `Student ${i}`);
  for (const source of [csv(...rows), rows.join("\n")]) {
    assert.equal(checkRosterCsv(`${source}\n`).rows.length, 200);
    assert.equal(checkRosterCsv(`${source}\nExtra`).ok, false);
  }
});

test("preflight has no storage or direct network dependency", () => {
  const review = readFileSync(new URL("../admin/v2/src/routes/players/RosterCsvReview.js", import.meta.url), "utf8");
  assert.doesNotMatch(review, /\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage|indexedDB)\b/);
});
