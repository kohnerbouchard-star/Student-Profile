import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  EnvironmentNeutralityError,
  verifyEnvironmentNeutralFrontend,
} from "./release-environment-neutrality.mjs";

async function write(root, relativePath, content) {
  const absolute = path.join(root, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content);
}

async function fixture(frontendSource) {
  const root = await mkdtemp(path.join(os.tmpdir(), "econovaria-neutrality-"));
  await write(root, "index.html", frontendSource);
  await write(root, "frontend/app.js", "export const api = '/functions/v1/classroom-api';\n");
  await write(root, "admin/app.js", "export const api = '/functions/v1/admin-api';\n");
  await write(root, "docs/operations/production-manifest-2026-07-17.json", JSON.stringify({
    supabase: { projectRef: "prodprojectref" },
    externalRuntime: { cloudflareWorkerOrigin: "https://legacy.example.workers.dev" },
  }));
  return root;
}

test("environment-neutral frontend permits relative API routes", async (t) => {
  const root = await fixture("<html><body>relative runtime configuration</body></html>\n");
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await verifyEnvironmentNeutralFrontend({ repoRoot: root });
  assert.equal(result.status, "environment-neutral");
});

test("environment-neutral frontend rejects absolute Supabase origins", async (t) => {
  const root = await fixture('<meta content="https://prodprojectref.supabase.co/functions/v1/admin-api">\n');
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    verifyEnvironmentNeutralFrontend({ repoRoot: root }),
    EnvironmentNeutralityError,
  );
});

test("environment-neutral frontend rejects audited Worker origins", async (t) => {
  const root = await fixture('const endpoint = "https://legacy.example.workers.dev";\n');
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    verifyEnvironmentNeutralFrontend({ repoRoot: root }),
    /audited live Worker origin|absolute Cloudflare Worker origin/,
  );
});
