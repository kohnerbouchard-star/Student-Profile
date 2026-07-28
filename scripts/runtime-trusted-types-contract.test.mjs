import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(
  new URL("../frontend/src/core/runtime-config.js", import.meta.url),
  "utf8",
);

const stagingConfiguration = Object.freeze({
  environment: "staging",
  projectRef: "eecvbssdvarfcykcfrny",
  supabaseUrl: "https://eecvbssdvarfcykcfrny.supabase.co",
  supabasePublishableKey: "sb_publishable_contract-test-not-a-secret",
});

test("assigns the dynamic logout helper through the econovaria Trusted Types policy", () => {
  const origin = "https://preview.example.app";
  const appendedScripts = [];
  const policyNames = [];
  let trustedPolicy;

  const document = {
    currentScript: {
      src: `${origin}/frontend/src/core/runtime-config.js`,
    },
    readyState: "complete",
    head: {
      append(node) {
        appendedScripts.push(node);
      },
    },
    querySelector(selector) {
      if (selector === 'meta[name="econovaria-admin-api-base"]') {
        return { content: "" };
      }
      return null;
    },
    getElementById(id) {
      return id === "loginScreen" ? {} : null;
    },
    createElement(tagName) {
      assert.equal(tagName, "script");
      return { dataset: {} };
    },
  };

  const window = {
    __ECONOVARIA_RUNTIME_CONFIG__: stagingConfiguration,
    location: { origin },
    document,
    atob(value) {
      return Buffer.from(value, "base64").toString("utf8");
    },
    trustedTypes: {
      createPolicy(name, rules) {
        policyNames.push(name);
        trustedPolicy = {
          createScriptURL(value) {
            return Object.freeze({
              type: "TrustedScriptURL",
              value: rules.createScriptURL(value),
            });
          },
        };
        return trustedPolicy;
      },
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
    TypeError,
    JSON,
    Math,
    Buffer,
  });
  vm.runInContext(source, context, { filename: "runtime-config.js" });

  assert.deepEqual(policyNames, ["econovaria"]);
  assert.equal(appendedScripts.length, 1);
  assert.deepEqual(appendedScripts[0].src, {
    type: "TrustedScriptURL",
    value: `${origin}/frontend/src/core/admin-logout-override.js`,
  });
  assert.equal(appendedScripts[0].async, true);
  assert.equal(
    appendedScripts[0].dataset.econovariaAdminLogoutOverride,
    "true",
  );
  assert.throws(
    () => trustedPolicy.createScriptURL("https://attacker.example/script.js"),
    /ECONOVARIA_TRUSTED_SCRIPT_URL_REJECTED/,
  );
});
