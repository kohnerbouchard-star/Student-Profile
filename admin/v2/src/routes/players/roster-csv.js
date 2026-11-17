export const ROSTER_CSV_MAX_BYTES = 128 * 1024;
export const ROSTER_CSV_MAX_ROWS = 200;
export const ROSTER_CSV_HEADERS = Object.freeze(["student_name"]);

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

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\ud800-\udfff\ufffd]/u;
const INTERNAL_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

const NAME_HEADERS = new Set(["name", "student name", "student_name", "display_name"]);

/** Names only. Repeated names are separate rows, never inferred student identities. */
export function checkRosterCsv(value, { headerMode = "auto" } = {}) {
  if (!["auto", "present", "absent"].includes(headerMode)) return invalid("Choose a valid header option.");
  if (typeof value !== "string" || !value.trim()) return invalid("Choose a non-empty UTF-8 CSV file.");
  if (new TextEncoder().encode(value).length > ROSTER_CSV_MAX_BYTES) {
    return invalid("Use a CSV file no larger than 128 KiB.");
  }
  let records;
  try { records = decodeCsv(value.replace(/^\uFEFF/, "")); }
  catch (error) {
    return invalid(error.message === "too_many_rows"
      ? "Use no more than 200 student rows."
      : "Invalid CSV structure. Use one name column and standard CSV quoting.");
  }
  while (records.length && records.at(-1).length === 1 && !records.at(-1)[0].trim()) records.pop();
  if (records.some((record) => record.length !== 1)) {
    return invalid("Use one column containing student names only. Do not include IDs, credentials, or other fields.");
  }
  const headerSkipped = headerMode === "present"
    || (headerMode === "auto" && NAME_HEADERS.has(records[0]?.[0]?.trim().toLowerCase()));
  const data = records.slice(headerSkipped ? 1 : 0);
  if (!data.length) return invalid("Add at least one student name.");
  if (data.length > ROSTER_CSV_MAX_ROWS) return invalid("Use no more than 200 student rows.");
  const rows = [];
  const errors = [];
  const seen = new Set();
  let duplicateNameCount = 0;
  data.forEach(([cell], index) => {
    const row = index + (headerSkipped ? 2 : 1);
    if (CONTROL_CHARACTERS.test(cell) || INTERNAL_UUID.test(cell)) {
      errors.push({ row, message: "Remove control characters, invalid UTF-8, line breaks, or internal UUIDs." });
      return;
    }
    const displayName = cell.trim().normalize("NFC");
    if (!displayName || displayName.length > 240) {
      errors.push({ row, message: "Student name must contain 1–240 characters." });
      return;
    }
    const comparison = displayName.toLowerCase();
    if (seen.has(comparison)) duplicateNameCount += 1;
    seen.add(comparison);
    rows.push({ row, displayName });
  });
  return { ok: !errors.length, rows: errors.length ? [] : rows, errors, headerSkipped, duplicateNameCount };
}
