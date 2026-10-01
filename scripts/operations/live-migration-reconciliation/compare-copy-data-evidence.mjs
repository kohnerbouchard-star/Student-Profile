#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EVIDENCE_PROFILE = "supabase-copy-application-data-v1";
const COMPARISON_PROFILE = "supabase-copy-application-data-comparison-v1";
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const INTEGER_PATTERN = /^-?(?:0|[1-9][0-9]*)$/u;

const ALLOWED_SET_WRAPPERS = new Set([
  "SET statement_timeout = 0;",
  "SET lock_timeout = 0;",
  "SET idle_in_transaction_session_timeout = 0;",
  "SET idle_session_timeout = 0;",
  "SET transaction_timeout = 0;",
  "SET client_encoding = 'UTF8';",
  "SET standard_conforming_strings = on;",
  "SET check_function_bodies = false;",
  "SET xmloption = content;",
  "SET client_min_messages = warning;",
  "SET row_security = off;",
  "SET default_tablespace = '';",
  "SET default_table_access_method = heap;",
]);

const SEARCH_PATH_WRAPPER = "SELECT pg_catalog.set_config('search_path', '', false);";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function qualifiedIdentifier(schema, name) {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`;
}

function skipWhitespace(source, position) {
  let cursor = position;
  while (cursor < source.length && /\s/u.test(source[cursor])) cursor += 1;
  return cursor;
}

function requireWhitespace(source, position, context) {
  const cursor = skipWhitespace(source, position);
  if (cursor === position) throw new Error(`${context}: expected whitespace`);
  return cursor;
}

function parseIdentifier(source, position, context) {
  if (source[position] === '"') {
    let cursor = position + 1;
    let value = "";
    while (cursor < source.length) {
      if (source[cursor] !== '"') {
        value += source[cursor];
        cursor += 1;
        continue;
      }
      if (source[cursor + 1] === '"') {
        value += '"';
        cursor += 2;
        continue;
      }
      if (value.length === 0) throw new Error(`${context}: empty quoted identifier`);
      return { value, position: cursor + 1 };
    }
    throw new Error(`${context}: unterminated quoted identifier`);
  }

  const match = /^[\p{L}_][\p{L}\p{N}_$]*/u.exec(source.slice(position));
  if (!match) throw new Error(`${context}: expected SQL identifier`);
  return { value: match[0].toLowerCase(), position: position + match[0].length };
}

function parseQualifiedIdentifier(source, position, context) {
  const schema = parseIdentifier(source, position, context);
  let cursor = skipWhitespace(source, schema.position);
  if (source[cursor] !== ".") throw new Error(`${context}: expected schema-qualified identifier`);
  cursor = skipWhitespace(source, cursor + 1);
  const name = parseIdentifier(source, cursor, context);
  return {
    schema: schema.value,
    name: name.value,
    position: name.position,
  };
}

function parseCanonicalIdentifier(value, context) {
  const parsed = parseIdentifier(value, 0, context);
  if (parsed.position !== value.length || quoteIdentifier(parsed.value) !== value) {
    throw new Error(`${context}: identifier is not canonically quoted`);
  }
  return parsed.value;
}

function parseCanonicalQualifiedIdentifier(value, context) {
  const parsed = parseQualifiedIdentifier(value, 0, context);
  if (
    parsed.position !== value.length ||
    qualifiedIdentifier(parsed.schema, parsed.name) !== value
  ) {
    throw new Error(`${context}: identifier is not canonically schema-qualified`);
  }
  return parsed;
}

function parseCopyHeader(line, lineNumber) {
  const context = `line ${lineNumber} COPY header`;
  if (!line.startsWith("COPY")) return null;
  let cursor = requireWhitespace(line, 4, context);
  const relation = parseQualifiedIdentifier(line, cursor, context);
  cursor = skipWhitespace(line, relation.position);
  if (line[cursor] !== "(") throw new Error(`${context}: expected ordered column list`);
  cursor = skipWhitespace(line, cursor + 1);

  const columns = [];
  while (true) {
    const column = parseIdentifier(line, cursor, context);
    columns.push(column.value);
    cursor = skipWhitespace(line, column.position);
    if (line[cursor] === ",") {
      cursor = skipWhitespace(line, cursor + 1);
      continue;
    }
    if (line[cursor] === ")") {
      cursor += 1;
      break;
    }
    throw new Error(`${context}: malformed ordered column list`);
  }
  if (new Set(columns).size !== columns.length) {
    throw new Error(`${context}: duplicate column identifier`);
  }

  cursor = requireWhitespace(line, cursor, context);
  if (!line.startsWith("FROM", cursor)) throw new Error(`${context}: expected FROM stdin`);
  cursor = requireWhitespace(line, cursor + 4, context);
  if (line.slice(cursor) !== "stdin;") throw new Error(`${context}: expected FROM stdin;`);

  return {
    qualifiedTable: qualifiedIdentifier(relation.schema, relation.name),
    columns: columns.map(quoteIdentifier),
  };
}

function decodeSqlString(literal, context) {
  if (literal.length < 2 || literal[0] !== "'" || literal.at(-1) !== "'") {
    throw new Error(`${context}: malformed SQL string literal`);
  }
  let result = "";
  for (let cursor = 1; cursor < literal.length - 1; cursor += 1) {
    if (literal[cursor] !== "'") {
      result += literal[cursor];
      continue;
    }
    if (literal[cursor + 1] !== "'") {
      throw new Error(`${context}: malformed SQL string escape`);
    }
    result += "'";
    cursor += 1;
  }
  return result;
}

function parseSequenceSetval(line, lineNumber) {
  if (!line.startsWith("SELECT pg_catalog.setval(")) return null;
  const context = `line ${lineNumber} sequence state`;
  const match = /^SELECT pg_catalog\.setval\(('(?:[^']|'')*'),\s*([+-]?[0-9]+),\s*(true|false)\);$/u.exec(line);
  if (!match) throw new Error(`${context}: malformed pg_catalog.setval statement`);
  const regclass = decodeSqlString(match[1], context);
  const sequence = parseQualifiedIdentifier(regclass, 0, context);
  if (sequence.position !== regclass.length) {
    throw new Error(`${context}: malformed sequence identifier`);
  }
  const lastValue = BigInt(match[2]).toString();
  return {
    qualifiedSequence: qualifiedIdentifier(sequence.schema, sequence.name),
    lastValue,
    isCalled: match[3] === "true",
  };
}

function buildRowMultisetEvidence(rows) {
  const multiplicity = new Map();
  for (const row of rows) {
    const digest = sha256(`supabase-copy-row-v1\0${row}`);
    multiplicity.set(digest, (multiplicity.get(digest) || 0) + 1);
  }
  const entries = [...multiplicity.entries()].sort(([left], [right]) => compareText(left, right));
  return {
    rowCount: rows.length,
    distinctRowCount: entries.length,
    rowMultisetSha256: sha256(`supabase-copy-row-multiset-v1\0${JSON.stringify(entries)}`),
  };
}

function contentPayload(tables, sequences) {
  return { tables, sequences };
}

function evidencePayload(evidence) {
  return {
    schemaVersion: evidence.schemaVersion,
    profile: evidence.profile,
    dumpSha256: evidence.dumpSha256,
    dumpBytes: evidence.dumpBytes,
    tableCount: evidence.tableCount,
    totalRowCount: evidence.totalRowCount,
    sequenceCount: evidence.sequenceCount,
    contentSha256: evidence.contentSha256,
    tables: evidence.tables,
    sequences: evidence.sequences,
  };
}

function exactKeys(value, keys, context) {
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${context}: unexpected evidence fields`);
  }
}

function safeCount(value, context) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${context}: expected a non-negative safe integer`);
  }
}

/**
 * Parse a Supabase/pg_dump plain-text, --data-only --use-copy dump and return
 * deterministic evidence. COPY row order and COPY statement order do not
 * affect contentSha256; duplicate rows remain significant.
 */
export function buildCopyDataEvidence(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error("COPY dump must not contain a UTF-8 byte-order mark");
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("COPY dump is not valid UTF-8");
  }
  if (text.includes("\0")) throw new Error("COPY dump contains a NUL byte");
  if (/(^|[^\r])\r(?!\n)/u.test(text)) throw new Error("COPY dump contains a bare carriage return");
  const lines = text.replaceAll("\r\n", "\n").split("\n");

  const tables = [];
  const sequences = [];
  const tableNames = new Set();
  const sequenceNames = new Set();
  const wrapperStatements = new Set();
  let restrictToken = null;
  let sawRestrict = false;
  let sawUnrestrict = false;
  let sawOperationalContent = false;

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("--")) continue;

    if (trimmed.startsWith("\\restrict")) {
      const match = /^\\restrict ([A-Za-z0-9]+)$/u.exec(trimmed);
      if (!match || sawRestrict || sawUnrestrict || sawOperationalContent) {
        throw new Error(`line ${lineNumber}: malformed or misplaced \\restrict wrapper`);
      }
      restrictToken = match[1];
      sawRestrict = true;
      continue;
    }

    if (trimmed.startsWith("\\unrestrict")) {
      const match = /^\\unrestrict ([A-Za-z0-9]+)$/u.exec(trimmed);
      if (!match || !sawRestrict || sawUnrestrict || match[1] !== restrictToken) {
        throw new Error(`line ${lineNumber}: malformed or unmatched \\unrestrict wrapper`);
      }
      sawUnrestrict = true;
      continue;
    }

    if (sawUnrestrict) {
      throw new Error(`line ${lineNumber}: material after \\unrestrict wrapper`);
    }
    sawOperationalContent = true;

    if (ALLOWED_SET_WRAPPERS.has(trimmed) || trimmed === SEARCH_PATH_WRAPPER) {
      if (wrapperStatements.has(trimmed)) {
        throw new Error(`line ${lineNumber}: duplicate pg_dump wrapper statement`);
      }
      wrapperStatements.add(trimmed);
      continue;
    }

    const copy = parseCopyHeader(trimmed, lineNumber);
    if (copy) {
      if (tableNames.has(copy.qualifiedTable)) {
        throw new Error(`line ${lineNumber}: duplicate COPY table ${copy.qualifiedTable}`);
      }
      const rows = [];
      let terminated = false;
      while (index + 1 < lines.length) {
        index += 1;
        const row = lines[index];
        if (row === "\\.") {
          terminated = true;
          break;
        }
        const fieldCount = row.split("\t").length;
        if (fieldCount !== copy.columns.length) {
          throw new Error(
            `line ${index + 1}: COPY row for ${copy.qualifiedTable} has ${fieldCount} fields; expected ${copy.columns.length}`,
          );
        }
        rows.push(row);
      }
      if (!terminated) throw new Error(`line ${lineNumber}: unterminated COPY data`);
      tableNames.add(copy.qualifiedTable);
      tables.push({
        qualifiedTable: copy.qualifiedTable,
        columns: copy.columns,
        ...buildRowMultisetEvidence(rows),
      });
      continue;
    }

    const sequence = parseSequenceSetval(trimmed, lineNumber);
    if (sequence) {
      if (sequenceNames.has(sequence.qualifiedSequence)) {
        throw new Error(`line ${lineNumber}: duplicate sequence state ${sequence.qualifiedSequence}`);
      }
      sequenceNames.add(sequence.qualifiedSequence);
      sequences.push(sequence);
      continue;
    }

    throw new Error(`line ${lineNumber}: unsupported material in COPY dump`);
  }

  if (sawRestrict && !sawUnrestrict) throw new Error("COPY dump has an unterminated \\restrict wrapper");
  if (tables.length === 0) throw new Error("COPY dump contains no COPY table data statements");

  tables.sort((left, right) => compareText(left.qualifiedTable, right.qualifiedTable));
  sequences.sort((left, right) => compareText(left.qualifiedSequence, right.qualifiedSequence));
  const totalRowCount = tables.reduce((sum, table) => {
    const next = sum + table.rowCount;
    if (!Number.isSafeInteger(next)) throw new Error("COPY dump row count exceeds safe integer range");
    return next;
  }, 0);
  const contentSha256 = sha256(
    `supabase-copy-application-data-content-v1\0${JSON.stringify(contentPayload(tables, sequences))}`,
  );
  const evidence = {
    schemaVersion: 1,
    profile: EVIDENCE_PROFILE,
    dumpSha256: sha256(bytes),
    dumpBytes: bytes.length,
    tableCount: tables.length,
    totalRowCount,
    sequenceCount: sequences.length,
    contentSha256,
    tables,
    sequences,
  };
  return {
    ...evidence,
    evidenceSha256: sha256(
      `supabase-copy-application-data-evidence-v1\0${JSON.stringify(evidencePayload(evidence))}`,
    ),
  };
}

export function validateCopyDataEvidence(evidence, context = "evidence") {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new Error(`${context}: expected an evidence object`);
  }
  exactKeys(evidence, [
    "schemaVersion",
    "profile",
    "dumpSha256",
    "dumpBytes",
    "tableCount",
    "totalRowCount",
    "sequenceCount",
    "contentSha256",
    "tables",
    "sequences",
    "evidenceSha256",
  ], context);
  if (evidence.schemaVersion !== 1 || evidence.profile !== EVIDENCE_PROFILE) {
    throw new Error(`${context}: unsupported evidence profile`);
  }
  if (!SHA256_PATTERN.test(evidence.dumpSha256) || !SHA256_PATTERN.test(evidence.contentSha256) ||
      !SHA256_PATTERN.test(evidence.evidenceSha256)) {
    throw new Error(`${context}: malformed SHA-256 digest`);
  }
  safeCount(evidence.dumpBytes, `${context}.dumpBytes`);
  safeCount(evidence.tableCount, `${context}.tableCount`);
  safeCount(evidence.totalRowCount, `${context}.totalRowCount`);
  safeCount(evidence.sequenceCount, `${context}.sequenceCount`);
  if (!Array.isArray(evidence.tables) || !Array.isArray(evidence.sequences)) {
    throw new Error(`${context}: tables and sequences must be arrays`);
  }
  if (evidence.tables.length !== evidence.tableCount || evidence.sequences.length !== evidence.sequenceCount) {
    throw new Error(`${context}: object counts do not match evidence arrays`);
  }

  let totalRowCount = 0;
  let priorTable = null;
  for (const [index, table] of evidence.tables.entries()) {
    const tableContext = `${context}.tables[${index}]`;
    if (!table || typeof table !== "object" || Array.isArray(table)) {
      throw new Error(`${tableContext}: expected an object`);
    }
    exactKeys(table, [
      "qualifiedTable",
      "columns",
      "rowCount",
      "distinctRowCount",
      "rowMultisetSha256",
    ], tableContext);
    parseCanonicalQualifiedIdentifier(table.qualifiedTable, `${tableContext}.qualifiedTable`);
    if (priorTable !== null && compareText(priorTable, table.qualifiedTable) >= 0) {
      throw new Error(`${context}: tables must be uniquely sorted`);
    }
    priorTable = table.qualifiedTable;
    if (!Array.isArray(table.columns) || table.columns.length === 0) {
      throw new Error(`${tableContext}.columns: expected a non-empty ordered array`);
    }
    const columnNames = table.columns.map((column, columnIndex) =>
      parseCanonicalIdentifier(column, `${tableContext}.columns[${columnIndex}]`));
    if (new Set(columnNames).size !== columnNames.length) {
      throw new Error(`${tableContext}.columns: duplicate identifier`);
    }
    safeCount(table.rowCount, `${tableContext}.rowCount`);
    safeCount(table.distinctRowCount, `${tableContext}.distinctRowCount`);
    if (table.distinctRowCount > table.rowCount) {
      throw new Error(`${tableContext}: distinct row count exceeds row count`);
    }
    if (!SHA256_PATTERN.test(table.rowMultisetSha256)) {
      throw new Error(`${tableContext}.rowMultisetSha256: malformed SHA-256 digest`);
    }
    totalRowCount += table.rowCount;
    if (!Number.isSafeInteger(totalRowCount)) {
      throw new Error(`${context}: total row count exceeds safe integer range`);
    }
  }
  if (totalRowCount !== evidence.totalRowCount) {
    throw new Error(`${context}: total row count does not match table evidence`);
  }

  let priorSequence = null;
  for (const [index, sequence] of evidence.sequences.entries()) {
    const sequenceContext = `${context}.sequences[${index}]`;
    if (!sequence || typeof sequence !== "object" || Array.isArray(sequence)) {
      throw new Error(`${sequenceContext}: expected an object`);
    }
    exactKeys(sequence, ["qualifiedSequence", "lastValue", "isCalled"], sequenceContext);
    parseCanonicalQualifiedIdentifier(sequence.qualifiedSequence, `${sequenceContext}.qualifiedSequence`);
    if (priorSequence !== null && compareText(priorSequence, sequence.qualifiedSequence) >= 0) {
      throw new Error(`${context}: sequences must be uniquely sorted`);
    }
    priorSequence = sequence.qualifiedSequence;
    if (typeof sequence.lastValue !== "string" || !INTEGER_PATTERN.test(sequence.lastValue) ||
        BigInt(sequence.lastValue).toString() !== sequence.lastValue) {
      throw new Error(`${sequenceContext}.lastValue: expected a canonical integer string`);
    }
    if (typeof sequence.isCalled !== "boolean") {
      throw new Error(`${sequenceContext}.isCalled: expected a boolean`);
    }
  }

  const expectedContentSha256 = sha256(
    `supabase-copy-application-data-content-v1\0${JSON.stringify(contentPayload(evidence.tables, evidence.sequences))}`,
  );
  if (evidence.contentSha256 !== expectedContentSha256) {
    throw new Error(`${context}: content SHA-256 does not match object evidence`);
  }
  const expectedEvidenceSha256 = sha256(
    `supabase-copy-application-data-evidence-v1\0${JSON.stringify(evidencePayload(evidence))}`,
  );
  if (evidence.evidenceSha256 !== expectedEvidenceSha256) {
    throw new Error(`${context}: evidence SHA-256 does not bind the dump and content`);
  }
  return evidence;
}

function tableDifference(source, restored) {
  const fields = ["columns", "rowCount", "distinctRowCount", "rowMultisetSha256"];
  return fields.filter((field) => JSON.stringify(source[field]) !== JSON.stringify(restored[field]));
}

function sequenceDifference(source, restored) {
  return ["lastValue", "isCalled"].filter((field) => source[field] !== restored[field]);
}

export function compareCopyDataEvidence(source, restored) {
  validateCopyDataEvidence(source, "source evidence");
  validateCopyDataEvidence(restored, "restored evidence");
  const differences = [];

  const sourceTables = new Map(source.tables.map((table) => [table.qualifiedTable, table]));
  const restoredTables = new Map(restored.tables.map((table) => [table.qualifiedTable, table]));
  for (const name of [...new Set([...sourceTables.keys(), ...restoredTables.keys()])].sort(compareText)) {
    if (!sourceTables.has(name)) {
      differences.push({ kind: "unexpected-table", object: name });
    } else if (!restoredTables.has(name)) {
      differences.push({ kind: "missing-table", object: name });
    } else {
      const fields = tableDifference(sourceTables.get(name), restoredTables.get(name));
      if (fields.length > 0) differences.push({ kind: "table-mismatch", object: name, fields });
    }
  }

  const sourceSequences = new Map(source.sequences.map((sequence) => [sequence.qualifiedSequence, sequence]));
  const restoredSequences = new Map(restored.sequences.map((sequence) => [sequence.qualifiedSequence, sequence]));
  for (const name of [...new Set([...sourceSequences.keys(), ...restoredSequences.keys()])].sort(compareText)) {
    if (!sourceSequences.has(name)) {
      differences.push({ kind: "unexpected-sequence", object: name });
    } else if (!restoredSequences.has(name)) {
      differences.push({ kind: "missing-sequence", object: name });
    } else {
      const fields = sequenceDifference(sourceSequences.get(name), restoredSequences.get(name));
      if (fields.length > 0) differences.push({ kind: "sequence-mismatch", object: name, fields });
    }
  }

  if (differences.length === 0 && source.contentSha256 !== restored.contentSha256) {
    differences.push({ kind: "content-digest-mismatch" });
  }
  return {
    schemaVersion: 1,
    profile: COMPARISON_PROFILE,
    matched: differences.length === 0,
    sourceDumpSha256: source.dumpSha256,
    restoredDumpSha256: restored.dumpSha256,
    sourceEvidenceSha256: source.evidenceSha256,
    restoredEvidenceSha256: restored.evidenceSha256,
    sourceContentSha256: source.contentSha256,
    restoredContentSha256: restored.contentSha256,
    differences,
  };
}

function parseArguments(argv) {
  const [command, ...tokens] = argv;
  if (command === "--help" || command === "-h") return { command: "help" };
  if (command !== "emit" && command !== "compare") throw new Error("expected command: emit or compare");
  const options = { command };
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(`malformed option near ${flag || "end of arguments"}`);
    }
    const name = flag.slice(2);
    if (Object.hasOwn(options, name)) throw new Error(`duplicate option: ${flag}`);
    options[name] = value;
  }
  const allowed = command === "emit" ? new Set(["command", "dump", "output"]) :
    new Set(["command", "source", "restored", "output"]);
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) throw new Error(`unknown option: --${key}`);
  }
  if (command === "emit" && !options.dump) throw new Error("emit requires --dump");
  if (command === "compare" && (!options.source || !options.restored)) {
    throw new Error("compare requires --source and --restored");
  }
  return options;
}

function usage() {
  return [
    "Usage:",
    "  compare-copy-data-evidence.mjs emit --dump <application-data.sql> [--output <evidence.json>]",
    "  compare-copy-data-evidence.mjs compare --source <source-evidence.json> --restored <restored-evidence.json> [--output <comparison.json>]",
  ].join("\n");
}

async function outputJson(value, output) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (output) await writeFile(output, serialized, { encoding: "utf8", flag: "wx" });
  else process.stdout.write(serialized);
}

export async function runCli(argv) {
  const options = parseArguments(argv);
  if (options.command === "help") {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  if (options.command === "emit") {
    const evidence = buildCopyDataEvidence(await readFile(options.dump));
    await outputJson(evidence, options.output);
    return 0;
  }
  const source = JSON.parse(await readFile(options.source, "utf8"));
  const restored = JSON.parse(await readFile(options.restored, "utf8"));
  const comparison = compareCopyDataEvidence(source, restored);
  await outputJson(comparison, options.output);
  return comparison.matched ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    process.exitCode = await runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`compare-copy-data-evidence: ${error.message}\n`);
    process.exitCode = 1;
  }
}
