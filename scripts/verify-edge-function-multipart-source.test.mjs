import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts/verify-edge-function-multipart-source.mjs");
const FUNCTION_NAME = "web-session-api";
const FILES = new Map([
  ["supabase/functions/web-session-api/index.ts", "export const entry = true;\n"],
  ["supabase/functions/_shared/econovariaAuth.ts", "export const auth = true;\n"],
  ["src/domains/auth/api/staffLoginHttpHandler.ts", "export const login = true;\n"],
  ["src/domains/auth/api/staffBootstrapHttpHandler.ts", "export const bootstrap = true;\n"],
  ["src/platform/supabase/edgeStaffSession.ts", "export const staff = true;\n"],
  ["src/platform/supabase/edgeResponse.ts", "export const response = true;\n"],
  ["src/security/rateLimitKeying.ts", "export const keying = true;\n"],
  ["src/security/webAdminSession.ts", "export const session = true;\n"],
]);

test("multipart verifier accepts the known production backend prefix", () => {
  withFixture((fixture) => {
    writeMultipart(fixture.stagingBody, fixture.stagingHeaders, "", FILES);
    writeMultipart(fixture.productionBody, fixture.productionHeaders, "backend/", FILES);
    const digest = run(fixture);
    assert.match(digest, /^[a-f0-9]{64}$/u);
  });
});

test("multipart verifier rejects any deployed source-byte drift", () => {
  withFixture((fixture) => {
    writeMultipart(fixture.stagingBody, fixture.stagingHeaders, "", FILES);
    const changed = new Map(FILES);
    changed.set("src/security/webAdminSession.ts", `${changed.get("src/security/webAdminSession.ts")}// drift\n`);
    writeMultipart(fixture.productionBody, fixture.productionHeaders, "backend/", changed);
    assert.throws(() => run(fixture));
  });
});

test("multipart verifier rejects path traversal", () => {
  withFixture((fixture) => {
    writeMultipart(fixture.stagingBody, fixture.stagingHeaders, "", FILES);
    const unsafe = new Map(FILES);
    unsafe.delete("src/security/webAdminSession.ts");
    unsafe.set("../webAdminSession.ts", "unsafe\n");
    writeMultipart(fixture.productionBody, fixture.productionHeaders, "backend/", unsafe);
    assert.throws(() => run(fixture));
  });
});

function withFixture(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "edge-multipart-verify-"));
  const fixture = {
    stagingBody: path.join(root, "staging.body"),
    stagingHeaders: path.join(root, "staging.headers"),
    productionBody: path.join(root, "production.body"),
    productionHeaders: path.join(root, "production.headers"),
  };
  try {
    callback(fixture);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function run(fixture) {
  return execFileSync(process.execPath, [
    SCRIPT,
    fixture.stagingBody,
    fixture.stagingHeaders,
    fixture.productionBody,
    fixture.productionHeaders,
    FUNCTION_NAME,
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function writeMultipart(bodyPath, headersPath, prefix, files) {
  const boundary = "econovaria-test-boundary";
  const chunks = [];
  chunks.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n` +
      `${JSON.stringify({ deno2_entrypoint_path: "supabase/functions/web-session-api/index.ts" })}\r\n`,
    "utf8",
  ));
  for (const [name, content] of files) {
    chunks.push(Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${prefix}${name}"\r\n` +
        `Supabase-Path: ${prefix}${name}\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`,
      "utf8",
    ));
    chunks.push(Buffer.from(content, "utf8"));
    chunks.push(Buffer.from("\r\n", "utf8"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  fs.writeFileSync(bodyPath, Buffer.concat(chunks));
  fs.writeFileSync(
    headersPath,
    `HTTP/1.1 200 OK\r\nContent-Type: multipart/form-data; boundary=${boundary}\r\n\r\n`,
  );
}
