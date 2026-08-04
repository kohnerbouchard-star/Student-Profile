import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  LocalFunctionEnvironmentError,
  prepareLocalFunctionEnvironment,
} from "./prepare-local-function-env.mjs";

const ENV_RELATIVE_PATH = path.join("backend", "supabase", "functions", ".env");

async function temporaryRepository(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "econovaria-local-env-"));
  try {
    await run(root, path.join(root, ENV_RELATIVE_PATH));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function parseEnvironment(source) {
  return Object.fromEntries(
    source.trim().split(/\r?\n/u).map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
  );
}

function validFixture(overrides = {}) {
  return {
    ECONOVARIA_RATE_LIMIT_HMAC_SECRET:
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-",
    ECONOVARIA_WEB_SESSION_ENCRYPTION_KEY:
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq",
    ECONOVARIA_PLAYER_CREDENTIAL_PEPPER:
      "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-",
    ECONOVARIA_TRUSTED_CLIENT_IP_HEADER: "x-real-ip",
    ...overrides,
  };
}

function serialize(values) {
  return `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`;
}

test("creates three independent local secrets with restrictive permissions", async () => {
  await temporaryRepository(async (root, envPath) => {
    const result = await prepareLocalFunctionEnvironment({ repoRoot: root });
    const source = await readFile(envPath, "utf8");
    const values = parseEnvironment(source);
    const metadata = await stat(envPath);

    assert.deepEqual(Object.keys(values), Object.keys(validFixture()));
    assert.match(values.ECONOVARIA_RATE_LIMIT_HMAC_SECRET, /^[A-Za-z0-9_-]{64}$/u);
    assert.match(values.ECONOVARIA_WEB_SESSION_ENCRYPTION_KEY, /^[A-Za-z0-9_-]{43}$/u);
    assert.match(values.ECONOVARIA_PLAYER_CREDENTIAL_PEPPER, /^[A-Za-z0-9_-]{64}$/u);
    assert.equal(values.ECONOVARIA_TRUSTED_CLIENT_IP_HEADER, "x-real-ip");
    assert.notEqual(
      values.ECONOVARIA_RATE_LIMIT_HMAC_SECRET,
      values.ECONOVARIA_PLAYER_CREDENTIAL_PEPPER,
    );
    if (process.platform !== "win32") assert.equal(metadata.mode & 0o077, 0);

    assert.equal(result.created, true);
    assert.equal(result.randomSecretCount, 3);
    assert.equal(result.secretsIncluded, false);
    const serializedResult = JSON.stringify(result);
    for (const value of Object.values(values).slice(0, 3)) {
      assert.equal(serializedResult.includes(value), false);
    }
  });
});

test("validates and preserves a complete existing environment", async () => {
  await temporaryRepository(async (root, envPath) => {
    await mkdir(path.dirname(envPath), { recursive: true });
    const original = serialize(validFixture());
    await writeFile(envPath, original, { mode: 0o600 });

    const result = await prepareLocalFunctionEnvironment({ repoRoot: root });
    assert.equal(result.created, false);
    assert.equal(await readFile(envPath, "utf8"), original);
  });
});

test("fails closed without changing an incomplete existing environment", async () => {
  await temporaryRepository(async (root, envPath) => {
    await mkdir(path.dirname(envPath), { recursive: true });
    const incomplete = serialize(validFixture({
      ECONOVARIA_PLAYER_CREDENTIAL_PEPPER: "",
    }));
    await writeFile(envPath, incomplete, { mode: 0o600 });

    await assert.rejects(
      prepareLocalFunctionEnvironment({ repoRoot: root }),
      (error) => {
        assert.ok(error instanceof LocalFunctionEnvironmentError);
        assert.equal(error.code, "LOCAL_FUNCTION_ENV_INCOMPLETE");
        assert.equal(error.message.includes("abcdefghijklmnopqrstuvwxyz"), false);
        return true;
      },
    );
    assert.equal(await readFile(envPath, "utf8"), incomplete);
  });
});

test("rejects an invalid trusted header without exposing existing secrets", async () => {
  await temporaryRepository(async (root, envPath) => {
    await mkdir(path.dirname(envPath), { recursive: true });
    const source = serialize(validFixture({
      ECONOVARIA_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
    }));
    await writeFile(envPath, source, { mode: 0o600 });

    await assert.rejects(
      prepareLocalFunctionEnvironment({ repoRoot: root }),
      (error) => {
        assert.ok(error instanceof LocalFunctionEnvironmentError);
        assert.equal(error.code, "LOCAL_FUNCTION_ENV_INVALID_TRUSTED_IP_HEADER");
        assert.equal(error.message.includes("ABCDEFGHIJKLMNOPQRSTUVWXYZ"), false);
        return true;
      },
    );
    assert.equal(await readFile(envPath, "utf8"), source);
  });
});
