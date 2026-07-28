import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  BROWSER_ROOTS,
  buildVercelDeployment,
} from "./build-vercel-runtime-config.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

async function fixtureRepository(root) {
  for (const relativePath of BROWSER_ROOTS) {
    const target = path.join(root, relativePath);
    if (relativePath === "index.html") {
      await writeFile(target, "<!doctype html><title>Econovaria</title>\n");
      continue;
    }
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, "fixture.txt"), `${relativePath}\n`);
  }
  await mkdir(path.join(root, "api", "admin-session"), { recursive: true });
  await writeFile(
    path.join(root, "api", "admin-session", "[...path].js"),
    "module.exports = () => {};\n",
  );
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await writeFile(path.join(root, "scripts", "private-fixture.txt"), "private\n");
}

test("builds an isolated static deployment without swallowing Vercel functions", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "econovaria-vercel-"));
  const fixtureRoot = path.join(temporaryRoot, "repository");
  const outputRoot = path.join(temporaryRoot, "dist");
  await mkdir(fixtureRoot, { recursive: true });
  await fixtureRepository(fixtureRoot);

  try {
    const result = await buildVercelDeployment({
      repoRoot: fixtureRoot,
      outputRoot,
      environment: {
        ECONOVARIA_ENVIRONMENT: "production",
        ECONOVARIA_PROJECT_REF: "cgiukdjwicykrmtkhudh",
        ECONOVARIA_SUPABASE_URL: "https://cgiukdjwicykrmtkhudh.supabase.co",
        ECONOVARIA_SUPABASE_PUBLISHABLE_KEY:
          "sb_publishable_contract-test-not-a-secret",
      },
    });

    assert.equal(result.outputRoot, outputRoot);
    for (const relativePath of BROWSER_ROOTS) {
      const metadata = await stat(path.join(outputRoot, relativePath));
      assert.equal(
        relativePath === "index.html" ? metadata.isFile() : metadata.isDirectory(),
        true,
      );
    }

    const runtimeSource = await readFile(
      path.join(outputRoot, "runtime-config.env.js"),
      "utf8",
    );
    assert.match(runtimeSource, /environment: "production"/);
    assert.match(runtimeSource, /cgiukdjwicykrmtkhudh/);
    assert.doesNotMatch(runtimeSource, /sb_secret_|service_role/i);

    await assert.rejects(access(path.join(outputRoot, "api")));
    await assert.rejects(access(path.join(outputRoot, "scripts")));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("Vercel config preserves API function discovery", async () => {
  const configuration = JSON.parse(
    await readFile(path.join(repositoryRoot, "vercel.json"), "utf8"),
  );

  assert.equal(configuration.framework, null);
  assert.equal(configuration.outputDirectory, "dist");
  assert.equal(
    configuration.buildCommand,
    "node scripts/build-vercel-runtime-config.mjs",
  );
  assert.equal(configuration.functions?.["api/**/*.js"]?.maxDuration, 30);

  const adminSessionRoute = await stat(
    path.join(repositoryRoot, "api", "admin-session", "[...path].js"),
  );
  assert.equal(adminSessionRoute.isFile(), true);
});
