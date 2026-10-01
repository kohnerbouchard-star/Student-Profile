import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildCopyDataEvidence,
  compareCopyDataEvidence,
  runCli,
  validateCopyDataEvidence,
} from "./compare-copy-data-evidence.mjs";

const wrappers = [
  "-- PostgreSQL database dump",
  "",
  "SET statement_timeout = 0;",
  "SET lock_timeout = 0;",
  "SET idle_in_transaction_session_timeout = 0;",
  "SET transaction_timeout = 0;",
  "SET client_encoding = 'UTF8';",
  "SET standard_conforming_strings = on;",
  "SELECT pg_catalog.set_config('search_path', '', false);",
  "SET check_function_bodies = false;",
  "SET xmloption = content;",
  "SET client_min_messages = warning;",
  "SET row_security = off;",
  "",
];

function dump(...body) {
  return [...wrappers, ...body, "", "-- PostgreSQL database dump complete", ""].join("\n");
}

function restrictedDump(token, body, closingToken = token, trailing = []) {
  return [
    "-- PostgreSQL database dump",
    "",
    `\\restrict ${token}`,
    "",
    ...wrappers.slice(2),
    ...body,
    "",
    "-- PostgreSQL database dump complete",
    "",
    `\\unrestrict ${closingToken}`,
    ...trailing,
    "",
  ].join("\n");
}

function copy(qualifiedTable, columns, rows) {
  return [
    `COPY ${qualifiedTable} (${columns.join(", ")}) FROM stdin;`,
    ...rows,
    "\\.",
  ];
}

function baselineDump({
  accountRows = ["1\t10.00", "2\t20.00", "2\t20.00"],
  columns = ['"id"', '"balance"'],
  accountTable = '"public"."account balances"',
  sequenceValue = "9007199254740993",
  sequenceCalled = true,
} = {}) {
  return dump(
    ...copy(accountTable, columns, accountRows),
    "",
    ...copy('"private"."audit""events"', ['"event""id"', '"payload"'], [
      "one\ttext with \\t escaped tab",
    ]),
    "",
    `SELECT pg_catalog.setval('public."account balances_id_seq"', ${sequenceValue}, ${sequenceCalled});`,
  );
}

test("emits deterministic quoted object, ordered-column, row-multiset, and sequence evidence", () => {
  const source = baselineDump();
  const evidence = buildCopyDataEvidence(source);

  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.profile, "supabase-copy-application-data-v1");
  assert.equal(evidence.dumpBytes, Buffer.byteLength(source));
  assert.match(evidence.dumpSha256, /^[a-f0-9]{64}$/u);
  assert.match(evidence.evidenceSha256, /^[a-f0-9]{64}$/u);
  assert.equal(evidence.tableCount, 2);
  assert.equal(evidence.totalRowCount, 4);
  assert.equal(evidence.sequenceCount, 1);
  assert.deepEqual(evidence.tables.map(({ qualifiedTable }) => qualifiedTable), [
    '"private"."audit""events"',
    '"public"."account balances"',
  ]);
  assert.deepEqual(evidence.tables[0].columns, ['"event""id"', '"payload"']);
  assert.deepEqual(evidence.tables[1].columns, ['"id"', '"balance"']);
  assert.equal(evidence.tables[1].rowCount, 3);
  assert.equal(evidence.tables[1].distinctRowCount, 2);
  assert.deepEqual(evidence.sequences, [{
    qualifiedSequence: '"public"."account balances_id_seq"',
    lastValue: "9007199254740993",
    isCalled: true,
  }]);
  assert.equal(validateCopyDataEvidence(evidence), evidence);
});

test("comparison is independent of table and row order but keeps each exact dump bound", () => {
  const sourceText = restrictedDump("AbC123", [
    ...copy('"public"."alpha"', ['"id"', '"value"'], ["1\tone", "2\ttwo", "2\ttwo"]),
    ...copy('"private"."beta"', ['"id"'], ["9", "8"]),
    "SELECT pg_catalog.setval('public.alpha_id_seq', 2, true);",
  ]);
  const restoredText = dump(
    ...copy("private.beta", ["id"], ["8", "9"]),
    "SELECT pg_catalog.setval('public.alpha_id_seq', 2, true);",
    ...copy("public.alpha", ["id", "value"], ["2\ttwo", "1\tone", "2\ttwo"]),
  ).replaceAll("\n", "\r\n");
  const source = buildCopyDataEvidence(sourceText);
  const restored = buildCopyDataEvidence(restoredText);
  const comparison = compareCopyDataEvidence(source, restored);

  assert.notEqual(source.dumpSha256, restored.dumpSha256);
  assert.notEqual(source.evidenceSha256, restored.evidenceSha256);
  assert.equal(source.contentSha256, restored.contentSha256);
  assert.equal(comparison.matched, true);
  assert.deepEqual(comparison.differences, []);
  assert.equal(comparison.sourceDumpSha256, source.dumpSha256);
  assert.equal(comparison.restoredDumpSha256, restored.dumpSha256);
});

test("duplicate row multiplicity is part of the multiset digest", () => {
  const source = buildCopyDataEvidence(baselineDump({ accountRows: ["1\t10", "1\t10", "2\t20"] }));
  const restored = buildCopyDataEvidence(baselineDump({ accountRows: ["1\t10", "2\t20", "2\t20"] }));
  const result = compareCopyDataEvidence(source, restored);

  assert.equal(source.totalRowCount, restored.totalRowCount);
  assert.equal(source.tables[1].distinctRowCount, restored.tables[1].distinctRowCount);
  assert.notEqual(source.tables[1].rowMultisetSha256, restored.tables[1].rowMultisetSha256);
  assert.equal(result.matched, false);
  assert.deepEqual(result.differences, [{
    kind: "table-mismatch",
    object: '"public"."account balances"',
    fields: ["rowMultisetSha256"],
  }]);
});

test("changed row values fail exact comparison", () => {
  const source = buildCopyDataEvidence(baselineDump());
  const restored = buildCopyDataEvidence(baselineDump({ accountRows: ["1\t10.00", "2\t20.01", "2\t20.00"] }));
  const result = compareCopyDataEvidence(source, restored);

  assert.equal(result.matched, false);
  assert.deepEqual(result.differences[0].fields, ["distinctRowCount", "rowMultisetSha256"]);
});

test("changed ordered columns fail even when row text is unchanged", () => {
  const source = buildCopyDataEvidence(baselineDump());
  const restored = buildCopyDataEvidence(baselineDump({ columns: ['"balance"', '"id"'] }));
  const result = compareCopyDataEvidence(source, restored);

  assert.equal(result.matched, false);
  assert.deepEqual(result.differences[0], {
    kind: "table-mismatch",
    object: '"public"."account balances"',
    fields: ["columns"],
  });
});

test("changed sequence value or is_called state fails", () => {
  const source = buildCopyDataEvidence(baselineDump());
  const changedValue = compareCopyDataEvidence(
    source,
    buildCopyDataEvidence(baselineDump({ sequenceValue: "9007199254740994" })),
  );
  const changedCalled = compareCopyDataEvidence(
    source,
    buildCopyDataEvidence(baselineDump({ sequenceCalled: false })),
  );

  assert.deepEqual(changedValue.differences, [{
    kind: "sequence-mismatch",
    object: '"public"."account balances_id_seq"',
    fields: ["lastValue"],
  }]);
  assert.deepEqual(changedCalled.differences, [{
    kind: "sequence-mismatch",
    object: '"public"."account balances_id_seq"',
    fields: ["isCalled"],
  }]);
});

test("changed table identity reports the exact missing and unexpected objects", () => {
  const source = buildCopyDataEvidence(baselineDump());
  const restored = buildCopyDataEvidence(baselineDump({ accountTable: '"public"."other"' }));
  const result = compareCopyDataEvidence(source, restored);

  assert.equal(result.matched, false);
  assert.deepEqual(result.differences.slice(0, 2), [
    { kind: "missing-table", object: '"public"."account balances"' },
    { kind: "unexpected-table", object: '"public"."other"' },
  ]);
});

test("rejects unrecognized statements, malformed COPY data, and unsafe wrappers", () => {
  const malformed = [
    [dump("INSERT INTO public.alpha VALUES (1);"), /unsupported material/u],
    [dump("DELETE FROM public.alpha;"), /unsupported material/u],
    [dump("SELECT public.side_effect();"), /unsupported material/u],
    [dump("SET ROLE postgres;"), /unsupported material/u],
    [dump('COPY "public"."alpha" ("id") FROM stdin;', "1"), /unterminated COPY data/u],
    [dump(...copy('"public"."alpha"', ['"id"', '"value"'], ["one-field"])), /has 1 fields; expected 2/u],
    [dump(...copy('"public"."alpha"', ['"id"'], ["1"]), ...copy('"public"."alpha"', ['"id"'], ["2"])), /duplicate COPY table/u],
    [dump("SELECT pg_catalog.setval('public.alpha_id_seq', 1, true);", "SELECT pg_catalog.setval('public.alpha_id_seq', 2, true);", ...copy('"public"."alpha"', ['"id"'], ["1"])), /duplicate sequence state/u],
    [dump('COPY "public"."alpha" ("id", "id") FROM stdin;', "1\t2", "\\."), /duplicate column identifier/u],
    [dump('COPY "public" ("id") FROM stdin;', "1", "\\."), /schema-qualified/u],
    [restrictedDump("token", copy('"public"."alpha"', ['"id"'], ["1"])).replace("\\unrestrict token", ""), /unterminated \\restrict/u],
    [restrictedDump("token", copy('"public"."alpha"', ['"id"'], ["1"]), "other"), /unmatched \\unrestrict/u],
    [restrictedDump("token", copy('"public"."alpha"', ['"id"'], ["1"]), "token", ["SELECT public.side_effect();"]), /material after \\unrestrict/u],
    [dump(), /no COPY table data/u],
  ];

  for (const [source, error] of malformed) {
    assert.throws(() => buildCopyDataEvidence(source), error);
  }
  assert.throws(
    () => buildCopyDataEvidence(Buffer.concat([Buffer.from(dump()), Buffer.from([0xff])])),
    /not valid UTF-8/u,
  );
  assert.throws(() => buildCopyDataEvidence(`\ufeff${baselineDump()}`), /byte-order mark/u);
  assert.throws(() => buildCopyDataEvidence(`${baselineDump()}\rmalformed`), /bare carriage return/u);
  assert.throws(() => buildCopyDataEvidence(`${baselineDump()}\0`), /NUL byte/u);
});

test("validation rejects evidence tampering, unsorted objects, and unbound dump metadata", () => {
  const evidence = buildCopyDataEvidence(baselineDump());
  assert.throws(
    () => validateCopyDataEvidence({ ...evidence, dumpSha256: "0".repeat(64) }),
    /does not bind the dump and content/u,
  );
  assert.throws(
    () => validateCopyDataEvidence({ ...evidence, contentSha256: "0".repeat(64) }),
    /content SHA-256 does not match/u,
  );
  assert.throws(
    () => validateCopyDataEvidence({ ...evidence, tables: [...evidence.tables].reverse() }),
    /tables must be uniquely sorted/u,
  );
  assert.throws(
    () => validateCopyDataEvidence({ ...evidence, ignored: true }),
    /unexpected evidence fields/u,
  );
});

test("CLI emits evidence and compares source with an independently ordered restored dump", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phase15-copy-evidence-"));
  const dumpPath = join(directory, "application-data.sql");
  const restoredDumpPath = join(directory, "restored-application-data.sql");
  const sourcePath = join(directory, "source.json");
  const restoredPath = join(directory, "restored.json");
  const comparisonPath = join(directory, "comparison.json");
  await writeFile(dumpPath, baselineDump());
  await writeFile(restoredDumpPath, baselineDump({
    accountRows: ["2\t20.00", "1\t10.00", "2\t20.00"],
  }));

  assert.equal(await runCli(["emit", "--dump", dumpPath, "--output", sourcePath]), 0);
  assert.equal(await runCli(["emit", "--dump", restoredDumpPath, "--output", restoredPath]), 0);
  assert.equal(await runCli([
    "compare",
    "--source",
    sourcePath,
    "--restored",
    restoredPath,
    "--output",
    comparisonPath,
  ]), 0);

  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  const result = JSON.parse(await readFile(comparisonPath, "utf8"));
  assert.equal(source.totalRowCount, 4);
  assert.equal(result.matched, true);
  assert.deepEqual(result.differences, []);
});

test("CLI compare returns a failure status while preserving sanitized mismatch evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phase15-copy-mismatch-"));
  const sourcePath = join(directory, "source.json");
  const restoredPath = join(directory, "restored.json");
  const outputPath = join(directory, "comparison.json");
  await writeFile(sourcePath, `${JSON.stringify(buildCopyDataEvidence(baselineDump()))}\n`);
  await writeFile(restoredPath, `${JSON.stringify(buildCopyDataEvidence(baselineDump({ sequenceCalled: false })))}\n`);

  assert.equal(await runCli([
    "compare",
    "--source",
    sourcePath,
    "--restored",
    restoredPath,
    "--output",
    outputPath,
  ]), 1);
  const result = JSON.parse(await readFile(outputPath, "utf8"));
  assert.equal(result.matched, false);
  assert.equal(result.differences[0].kind, "sequence-mismatch");
  assert.equal(JSON.stringify(result).includes("10.00"), false);
});
