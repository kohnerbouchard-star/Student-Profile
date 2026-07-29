import crypto from "node:crypto";
import fs from "node:fs";

const [stagingBodyPath, stagingHeadersPath, productionBodyPath, productionHeadersPath, functionName] = process.argv.slice(2);
if (
  !stagingBodyPath ||
  !stagingHeadersPath ||
  !productionBodyPath ||
  !productionHeadersPath ||
  !/^[a-z0-9-]{1,64}$/u.test(functionName || "")
) {
  throw new Error(
    "Usage: node verify-edge-function-multipart-source.mjs <staging-body> <staging-headers> <production-body> <production-headers> <function-name>",
  );
}

const staging = canonicalMultipartSource(
  stagingBodyPath,
  stagingHeadersPath,
  functionName,
  "staging",
);
const production = canonicalMultipartSource(
  productionBodyPath,
  productionHeadersPath,
  functionName,
  "production",
);

if (staging.digest !== production.digest) {
  const stagingNames = new Set(staging.rows.map((row) => row.name));
  const productionNames = new Set(production.rows.map((row) => row.name));
  const missing = [...stagingNames].filter((name) => !productionNames.has(name));
  const unexpected = [...productionNames].filter((name) => !stagingNames.has(name));
  const changed = staging.rows
    .filter((row) => {
      const other = production.rows.find((candidate) => candidate.name === row.name);
      return other && (other.bytes !== row.bytes || other.sha256 !== row.sha256);
    })
    .map((row) => row.name);
  throw new Error(
    `Production deployed source differs from staging. ` +
      `missing=${JSON.stringify(missing.slice(0, 10))} ` +
      `unexpected=${JSON.stringify(unexpected.slice(0, 10))} ` +
      `changed=${JSON.stringify(changed.slice(0, 10))}`,
  );
}

process.stdout.write(`${production.digest}\n`);

function canonicalMultipartSource(bodyPath, headersPath, expectedFunctionName, label) {
  const body = fs.readFileSync(bodyPath);
  const contentType = readLastContentType(fs.readFileSync(headersPath, "utf8"));
  const boundary = readBoundary(contentType);
  const parts = parseMultipart(body, boundary);
  const names = new Set();
  const rows = [];

  for (const part of parts) {
    const fieldName = dispositionParameter(part.headers["content-disposition"], "name");
    const rawPath = part.headers["supabase-path"] ||
      dispositionParameter(part.headers["content-disposition"], "filename*") ||
      dispositionParameter(part.headers["content-disposition"], "filename") ||
      "";
    if (!rawPath) {
      if (fieldName === "metadata") continue;
      if (part.body.length === 0) continue;
      throw new Error(`${label} function body contains an unnamed multipart part.`);
    }

    const name = canonicalName(rawPath, expectedFunctionName);
    if (names.has(name)) {
      throw new Error(`${label} function body contains duplicate path: ${name}`);
    }
    names.add(name);
    rows.push({
      name,
      bytes: part.body.length,
      sha256: crypto.createHash("sha256").update(part.body).digest("hex"),
    });
  }

  rows.sort((left, right) => left.name.localeCompare(right.name));
  const entrypoint = `supabase/functions/${expectedFunctionName}/index.ts`;
  if (!rows.some((row) => row.name === entrypoint)) {
    throw new Error(`${label} function body entrypoint is missing: ${entrypoint}`);
  }
  if (rows.length < 8) {
    throw new Error(`${label} function body graph is unexpectedly small: ${rows.length}`);
  }

  return {
    rows,
    digest: crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
  };
}

function readLastContentType(rawHeaders) {
  const blocks = rawHeaders.split(/\r?\n\r?\n/u).filter(Boolean);
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const line = blocks[index]
      .split(/\r?\n/u)
      .find((value) => /^content-type\s*:/iu.test(value));
    if (line) return line.slice(line.indexOf(":") + 1).trim();
  }
  throw new Error("Function body response is missing Content-Type.");
}

function readBoundary(contentType) {
  if (!/^multipart\//iu.test(contentType)) {
    throw new Error(`Expected multipart function body, received ${contentType || "unknown"}.`);
  }
  const match = contentType.match(/(?:^|;)\s*boundary=(?:"([^"]+)"|([^;\s]+))/iu);
  const boundary = match?.[1] || match?.[2] || "";
  if (!boundary || boundary.length > 200 || /[\r\n\u0000]/u.test(boundary)) {
    throw new Error("Function body response has an invalid multipart boundary.");
  }
  return boundary;
}

function parseMultipart(payload, boundary) {
  const delimiter = Buffer.from(`--${boundary}`, "utf8");
  const nextPrefix = Buffer.from(`\r\n--${boundary}`, "utf8");
  const separator = Buffer.from("\r\n\r\n", "utf8");
  const parts = [];
  let delimiterIndex = payload.indexOf(delimiter);
  if (delimiterIndex < 0) throw new Error("Multipart body is missing its opening boundary.");

  while (delimiterIndex >= 0) {
    let partStart = delimiterIndex + delimiter.length;
    if (payload[partStart] === 45 && payload[partStart + 1] === 45) break;
    if (payload[partStart] === 13 && payload[partStart + 1] === 10) partStart += 2;

    const separatorIndex = payload.indexOf(separator, partStart);
    if (separatorIndex < 0) throw new Error("Multipart part is missing its header separator.");
    const bodyStart = separatorIndex + separator.length;
    const nextIndex = payload.indexOf(nextPrefix, bodyStart);
    if (nextIndex < 0) throw new Error("Multipart body is missing its closing boundary.");

    parts.push({
      headers: parsePartHeaders(payload.subarray(partStart, separatorIndex).toString("utf8")),
      body: payload.subarray(bodyStart, nextIndex),
    });
    delimiterIndex = nextIndex + 2;
  }
  return parts;
}

function parsePartHeaders(raw) {
  const headers = {};
  for (const line of raw.split("\r\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (!/^[a-z0-9-]+$/u.test(name) || /[\r\n\u0000]/u.test(value)) {
      throw new Error("Multipart part contains an invalid header.");
    }
    headers[name] = value;
  }
  return headers;
}

function dispositionParameter(raw, parameter) {
  if (!raw) return "";
  const escaped = parameter.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const quoted = raw.match(new RegExp(`(?:^|;)\\s*${escaped}="((?:[^"\\\\]|\\\\.)*)"`, "iu"));
  let value = quoted?.[1]?.replace(/\\"/gu, '"') || "";
  if (!value) {
    const token = raw.match(new RegExp(`(?:^|;)\\s*${escaped}=([^;\\s]+)`, "iu"));
    value = token?.[1] || "";
  }
  if (parameter === "filename*" && value) {
    const match = value.match(/^(?:utf-8|us-ascii)'[^']*'(.*)$/iu);
    if (!match) throw new Error("Multipart filename* is malformed.");
    try {
      value = decodeURIComponent(match[1]);
    } catch {
      throw new Error("Multipart filename* encoding is invalid.");
    }
  }
  return value;
}

function canonicalName(value, expectedFunctionName) {
  let name = String(value || "").replaceAll("\\", "/").replace(/^\.\//u, "");
  if (name.startsWith("backend/")) name = name.slice("backend/".length);
  const wrappedPrefix = `supabase/functions/${expectedFunctionName}/backend/`;
  if (name.startsWith(wrappedPrefix)) name = name.slice(wrappedPrefix.length);
  if (
    !name ||
    name.startsWith("/") ||
    name.split("/").includes("..") ||
    /[\u0000-\u001f\u007f]/u.test(name)
  ) {
    throw new Error(`Function body contains an invalid path: ${JSON.stringify(name)}`);
  }
  return name;
}
