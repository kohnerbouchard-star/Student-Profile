import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts/verify-downloaded-edge-function-source.mjs");
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

test("canonical verifier accepts the known downloaded backend source-root difference", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "edge-source-verify-"));
  const staging = path.join(root, "staging");
  const production = path.join(root, "production");
  try {
    writeTree(staging, "");
    writeTree(production, `supabase/functions/${FUNCTION_NAME}/backend/`);
    assertDigest(staging, production);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("canonical verifier rejects any downloaded source-byte difference", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "edge-source-verify-"));
  const staging = path.join(root, "staging");
  const production = path.join(root, "production");
  try {
    writeTree(staging, "");
    writeTree(production, `supabase/functions/${FUNCTION_NAME}/backend/`);
    fs.appendFileSync(
      path.join(
        production,
        `supabase/functions/${FUNCTION_NAME}/backend/src/security/webAdminSession.ts`,
      ),
      "// drift\n",
    );
    assertMismatch(staging, production);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("canonical verifier accepts Management API files with the known backend prefix", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "edge-source-json-"));
  const staging = path.join(root, "staging.json");
  const production = path.join(root, "production.json");
  try {
    writeFunctionJson(staging, "");
    writeFunctionJson(production, "backend/");
    assertDigest(staging, production);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("canonical verifier rejects Management API source-byte drift", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "edge-source-json-"));
  const staging = path.join(root, "staging.json");
  const production = path.join(root, "production.json");
  try {
    writeFunctionJson(staging, "");
    writeFunctionJson(production, "backend/", {
      "src/security/webAdminSession.ts": "// drift\n",
    });
    assertMismatch(staging, production);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function assertDigest(staging, production) {
  const digest = execFileSync(
    process.execPath,
    [SCRIPT, staging, production, FUNCTION_NAME],
    { encoding: "utf8" },
  ).trim();
  assert.match(digest, /^[a-f0-9]{64}$/u);
}

function assertMismatch(staging, production) {
  assert.throws(() => execFileSync(
    process.execPath,
    [SCRIPT, staging, production, FUNCTION_NAME],
    { encoding: "utf8", stdio: "pipe" },
  ));
}

function writeTree(root, prefix) {
  for (const [name, content] of FILES) {
    const target = path.join(root, prefix, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

function writeFunctionJson(target, prefix, overrides = {}) {
  const files = [...FILES].map(([name, content]) => ({
    name: `${prefix}${name}`,
    content: `${content}${overrides[name] || ""}`,
  }));
  fs.writeFileSync(target, JSON.stringify({
    slug: FUNCTION_NAME,
    name: FUNCTION_NAME,
    status: "ACTIVE",
    verify_jwt: false,
    files,
  }));
}
