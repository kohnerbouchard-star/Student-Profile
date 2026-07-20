import fs from "node:fs";
import crypto from "node:crypto";

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i]?.replace(/^--/, "")] = argv[i + 1];
  return out;
}

function readRecords(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.result?.result)) return value.result.result;
  if (Array.isArray(value?.records)) return value.records;
  throw new Error("Input must be an array or contain records/result.result.");
}

function readTimestamp(record) {
  const raw = record.timestamp ?? record.time ?? record.created_at;
  const numeric = typeof raw === "number" && raw > 1e14 ? raw / 1000 : raw;
  const value = typeof numeric === "number" ? new Date(numeric) : new Date(String(numeric));
  if (!Number.isFinite(value.getTime())) throw new Error("Record has an invalid timestamp.");
  return value;
}

function runtimeName(record) {
  const text = [record.function_name, record.function_id, record.deployment_id, record.event_message, record.url, record.path].filter(Boolean).join(" ");
  for (const name of ["make-server-0dbf686f", "admin-api-staging", "stock-market-simulation", "stock-market-game-api", "stock-market-data", "stock-market-sim", "server"]) {
    if (new RegExp(`(?:functions/v1/|[_-])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[/_\\s-]|$)`, "i").test(text) || text.includes(name)) return name;
  }
  if (text.includes("silent-haze-ca17") || text.includes("workers.dev")) return "silent-haze-ca17";
  return null;
}

function fingerprint(record) {
  const source = [record.consumer, record.user_agent_class, record.user_agent, record.client_id, record.request_id, record.ip_hash].filter(Boolean).join("|") || "unknown";
  return crypto.createHash("sha256").update(source).digest("hex").slice(0, 16);
}

export function analyze({ records, start, end, maxRecords = 1000 }) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (![startDate, endDate].every((value) => Number.isFinite(value.getTime())) || endDate <= startDate) throw new Error("A valid start/end range is required.");
  if ((endDate - startDate) > 24 * 60 * 60 * 1000) throw new Error("Window exceeds 24 hours.");
  if (records.length > maxRecords || maxRecords > 1000) throw new Error("Record limit exceeds 1000.");
  const legacy = [];
  for (const record of records) {
    const timestamp = readTimestamp(record);
    if (timestamp < startDate || timestamp >= endDate) continue;
    const runtime = runtimeName(record);
    if (!runtime) continue;
    const status = Number(record.status_code ?? record.status ?? 0);
    const known = Boolean(record.consumer && record.owner);
    legacy.push({ timestamp: timestamp.toISOString(), runtime, method: String(record.method ?? "UNKNOWN"), status, consumerFingerprint: fingerprint(record), classification: known ? "known" : "unknown", owner: known ? String(record.owner) : null, successful: status >= 200 && status < 400 });
  }
  const blockers = legacy.filter((entry) => entry.classification === "unknown" || entry.successful);
  return { schemaVersion: 1, window: { start: startDate.toISOString(), end: endDate.toISOString() }, recordsScanned: records.length, legacyRequests: legacy, retirementBlocked: blockers.length > 0, blockerCount: blockers.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const input = JSON.parse(fs.readFileSync(args.input, "utf8"));
    const result = analyze({ records: readRecords(input), start: args.start, end: args.end, maxRecords: Number(args["max-records"] ?? 1000) });
    console.log(JSON.stringify(result, null, 2));
    if (result.retirementBlocked) process.exitCode = 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
