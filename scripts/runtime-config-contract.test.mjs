import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(
  new URL("../frontend/src/core/runtime-config.js", import.meta.url),
  "utf8",
);

function execute(config) {
  const meta = { content: "" };
  const window = {
    __ECONOVARIA_RUNTIME_CONFIG__: config,
    document: {
      querySelector(selector) {
        return selector === 'meta[name="econovaria-admin-api-base"]' ? meta : null;
      },
    },
    atob(value) {
      return Buffer.from(value, "base64").toString("utf8");
    },
  };
  const context = vm.createContext({
    window,
    globalThis: window,
    URL,
    Object,
    Set,
    String,
    Error,
    JSON,
    Math,
    Buffer,
  });
  vm.runInContext(source, context, { filename: "runtime-config.js" });
  return { runtime: window.EconovariaRuntimeConfig, meta };
}

const stagingConfig = Object.freeze({
  environment: "staging",
  projectRef: "eecvbssdvarfcykcfrny",
  supabaseUrl: "https://eecvbssdvarfcykcfrny.supabase.co",
  supabasePublishableKey: "sb_publishable_example-only-not-a-secret",
});

test("accepts an isolated staging publishable configuration", () => {
  const { runtime, meta } = execute(stagingConfig);
  assert.equal(runtime.environment, "staging");
  assert.equal(runtime.projectRef, "eecvbssdvarfcykcfrny");
  assert.equal(
    runtime.classroomApiUrl,
    "https://eecvbssdvarfcykcfrny.supabase.co/functions/v1/classroom-api",
  );
  assert.equal(
    runtime.adminApiUrl,
    "https://eecvbssdvarfcykcfrny.supabase.co/functions/v1/admin-api",
  );
  assert.equal(meta.content, runtime.adminApiUrl);
  assert.equal(Object.isFrozen(runtime), true);
});

test("fails closed when deployment configuration is absent", () => {
  assert.throws(
    () => execute(undefined),
    /ECONOVARIA_RUNTIME_CONFIG_REQUIRED/,
  );
});

test("rejects a URL that does not match the configured project", () => {
  assert.throws(
    () => execute({
      ...stagingConfig,
      supabaseUrl: "https://cgiukdjwicykrmtkhudh.supabase.co",
    }),
    /ECONOVARIA_RUNTIME_CONFIG_PROJECT_URL_MISMATCH/,
  );
});

test("rejects secret API keys in browser configuration", () => {
  assert.throws(
    () => execute({
      ...stagingConfig,
      supabasePublishableKey: "sb_secret_prohibited",
    }),
    /ECONOVARIA_RUNTIME_CONFIG_SECRET_KEY_PROHIBITED/,
  );
});

test("rejects non-HTTPS remote Supabase URLs", () => {
  assert.throws(
    () => execute({
      ...stagingConfig,
      supabaseUrl: "http://eecvbssdvarfcykcfrny.supabase.co",
    }),
    /ECONOVARIA_RUNTIME_CONFIG_REQUIRES_HTTPS/,
  );
});
