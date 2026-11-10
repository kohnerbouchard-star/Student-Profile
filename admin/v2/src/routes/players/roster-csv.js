export const ROSTER_CSV_MAX_BYTES = 128 * 1024;
export const ROSTER_CSV_MAX_ROWS = 200;
export const ROSTER_CSV_HEADERS = Object.freeze(["display_name", "roster_label", "player_identifier"]);

function invalid(message, row = null) {
  return { ok: false, rows: [], errors: [{ row, message }] };
}

/** Strict CSV decoding. Errors never include source values or unknown headers. */
function decodeCsv(source) {
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;
  let closed = false;
  function finishField() {
    record.push(field);
    field = "";
    closed = false;
  }
  function finishRecord() {
    finishField();
    records.push(record);
    record = [];
  }
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else field += char;
      continue;
    }
    if (char === ",") finishField();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      finishRecord();
      if (records.length > ROSTER_CSV_MAX_ROWS + 1) throw new Error("too_many_rows");
    } else if (char === '"' && !field && !closed) quoted = true;
    else if (closed || char === '"') throw new Error("malformed_csv");
    else field += char;
    if (record.length > ROSTER_CSV_HEADERS.length) throw new Error("column_count");
  }
  if (quoted) throw new Error("malformed_csv");
  if (field || record.length || closed) finishRecord();
  return records;
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\ufffd]/u;
const INTERNAL_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

/** Local readiness check only. Does not match, provision, or update server records. */
export function checkRosterCsv(value) {
  if (typeof value !== "string" || !value.trim()) return invalid("Choose a non-empty UTF-8 CSV file.");
  if (new TextEncoder().encode(value).length > ROSTER_CSV_MAX_BYTES) {
    return invalid("Use a CSV file no larger than 128 KiB.");
  }
  let records;
  try { records = decodeCsv(value.replace(/^\uFEFF/, "")); }
  catch (error) {
    return invalid(error.message === "too_many_rows"
      ? "Use no more than 200 player rows."
      : "Invalid CSV structure. Use three columns and standard CSV quoting.");
  }
  if (!records.length || records[0].length !== ROSTER_CSV_HEADERS.length
    || records[0].some((header, index) => header.trim() !== ROSTER_CSV_HEADERS[index])) {
    return invalid("Use exactly these columns, in order: display_name, roster_label, player_identifier. Do not include Access Codes or other personal information.");
  }
  const data = records.slice(1);
  if (!data.length) return invalid("Add at least one player row after the header.");
  if (data.length > ROSTER_CSV_MAX_ROWS) return invalid("Use no more than 200 player rows.");
  const rows = [];
  const errors = [];
  const identifiers = new Map();
  data.forEach((record, index) => {
    const row = index + 2;
    const report = (message) => errors.push({ row, message });
    if (record.length !== ROSTER_CSV_HEADERS.length) {
      report("Expected exactly three columns.");
      return;
    }
    if (record.some((cell) => CONTROL_CHARACTERS.test(cell) || INTERNAL_UUID.test(cell))) {
      report("Remove control characters, invalid UTF-8, line breaks, or internal UUIDs.");
      return;
    }
    const [displayName, rosterLabel, identifier] = record.map((cell) => cell.trim());
    const playerIdentifier = identifier.toUpperCase();
    if (!displayName || displayName.length > 240) report("Player name must contain 1–240 characters.");
    if (rosterLabel.length > 240) report("Roster label must contain no more than 240 characters.");
    if (!/^[A-Z0-9:_-]{1,128}$/.test(playerIdentifier)) {
      report("Player ID must contain 1–128 letters, numbers, colons, underscores, or hyphens.");
    } else if (identifiers.has(playerIdentifier)) {
      report(`Player ID duplicates row ${identifiers.get(playerIdentifier)} in this file.`);
    } else identifiers.set(playerIdentifier, row);
    rows.push({ row, displayName, rosterLabel, playerIdentifier });
  });
  return { ok: !errors.length, rows: errors.length ? [] : rows, errors };
}
