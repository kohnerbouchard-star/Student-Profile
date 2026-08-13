import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSupabaseSmtpPayload,
  configureSupabaseAuthSmtp,
  parseSenderIdentity,
  sanitizeSmtpConfig,
} from "./configure-supabase-auth-smtp.mjs";

const RESEND_KEY = "re_test_bootstrap_key_123456789";
const ACCESS_TOKEN = "sbp_test_management_token";
const PROJECT_REF = "eecvbssdvarfcykcfrny";
const AUTH_FROM = "Econovaria Security <no-reply@econovaria.com>";

test("sender identity and SMTP payload are deterministic", () => {
  const sender = parseSenderIdentity(
    "Econovaria Security <No-Reply@Econovaria.com>",
  );
  assert.deepEqual(sender, {
    senderName: "Econovaria Security",
    senderEmail: "no-reply@econovaria.com",
    senderDomain: "econovaria.com",
  });
  assert.deepEqual(
    parseSenderIdentity("no-reply@econovaria.com"),
    sender,
  );
  assert.deepEqual(buildSupabaseSmtpPayload(sender, RESEND_KEY), {
    smtp_admin_email: "no-reply@econovaria.com",
    smtp_host: "smtp.resend.com",
    smtp_port: "465",
    smtp_user: "resend",
    smtp_pass: RESEND_KEY,
    smtp_sender_name: "Econovaria Security",
  });
  assert.throws(
    () => parseSenderIdentity("not-an-email"),
    /valid email address/u,
  );
  assert.throws(
    () => parseSenderIdentity("Other Name <no-reply@econovaria.com>"),
    /must use the sender name Econovaria Security/u,
  );
  assert.throws(
    () => buildSupabaseSmtpPayload(sender, "invalid"),
    /RESEND_API_KEY/u,
  );
});

test("SMTP config snapshots never retain the provider password", () => {
  const sanitized = sanitizeSmtpConfig({
    smtp_admin_email: "no-reply@econovaria.com",
    smtp_host: "smtp.resend.com",
    smtp_port: "465",
    smtp_user: "resend",
    smtp_pass: RESEND_KEY,
    smtp_sender_name: "Econovaria Security",
  });
  assert.deepEqual(sanitized, {
    configured: true,
    host: "smtp.resend.com",
    port: "465",
    user: "resend",
    adminEmail: "no-reply@econovaria.com",
    senderName: "Econovaria Security",
  });
  assert.doesNotMatch(JSON.stringify(sanitized), /re_test_/u);
});

test("apply mode disables Resend tracking and verifies Supabase SMTP", async () => {
  const calls = [];
  const fetchImpl = createQueuedFetch(calls, [
    jsonResponse({
      object: "list",
      data: [{
        id: "domain-id",
        name: "econovaria.com",
        status: "verified",
        capabilities: { sending: "enabled", receiving: "disabled" },
      }],
    }),
    jsonResponse({}),
    jsonResponse({ object: "domain", id: "domain-id" }),
    jsonResponse({}),
    jsonResponse({
      smtp_admin_email: "no-reply@econovaria.com",
      smtp_host: "smtp.resend.com",
      smtp_port: "465",
      smtp_user: "resend",
      smtp_sender_name: "Econovaria Security",
    }),
  ]);

  const result = await configureSupabaseAuthSmtp(
    { environment: "staging", mode: "apply" },
    {
      fetchImpl,
      environmentValue: (name) => ({
        SUPABASE_ACCESS_TOKEN: ACCESS_TOKEN,
        RESEND_API_KEY: RESEND_KEY,
        ECONOVARIA_AUTH_EMAIL_FROM: AUTH_FROM,
      })[name] || "",
    },
  );

  assert.equal(result.evidence.projectRef, PROJECT_REF);
  assert.equal(result.evidence.resend.trackingUpdateApplied, true);
  assert.equal(result.evidence.smtp.updateApplied, true);
  assert.equal(result.evidence.smtp.configured, true);
  assert.equal(result.evidence.smtp.adminEmail, "no-reply@econovaria.com");
  assert.doesNotMatch(JSON.stringify(result), /re_test_bootstrap/u);

  assert.equal(calls.length, 5);
  assert.equal(calls[0].url, "https://api.resend.com/domains");
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[1].url, `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`);
  assert.equal(calls[1].method, "GET");
  assert.equal(calls[2].url, "https://api.resend.com/domains/domain-id");
  assert.equal(calls[2].method, "PATCH");
  assert.deepEqual(JSON.parse(calls[2].body), {
    click_tracking: false,
    open_tracking: false,
  });
  assert.equal(calls[3].method, "PATCH");
  assert.equal(JSON.parse(calls[3].body).smtp_pass, RESEND_KEY);
  assert.equal(calls[4].method, "GET");
});

test("missing protected sender identity fails before provider access", async () => {
  const calls = [];
  await assert.rejects(
    configureSupabaseAuthSmtp(
      { environment: "staging", mode: "apply" },
      {
        fetchImpl: createQueuedFetch(calls, []),
        environmentValue: (name) => ({
          SUPABASE_ACCESS_TOKEN: ACCESS_TOKEN,
          RESEND_API_KEY: RESEND_KEY,
        })[name] || "",
      },
    ),
    /valid email address/u,
  );
  assert.equal(calls.length, 0);
});

test("unverified sender domains fail before any Supabase mutation", async () => {
  const calls = [];
  const fetchImpl = createQueuedFetch(calls, [
    jsonResponse({
      object: "list",
      data: [{
        id: "domain-id",
        name: "econovaria.com",
        status: "pending",
        capabilities: { sending: "enabled" },
      }],
    }),
  ]);

  await assert.rejects(
    configureSupabaseAuthSmtp(
      { environment: "staging", mode: "apply" },
      {
        fetchImpl,
        environmentValue: (name) => ({
          SUPABASE_ACCESS_TOKEN: ACCESS_TOKEN,
          RESEND_API_KEY: RESEND_KEY,
          ECONOVARIA_AUTH_EMAIL_FROM: AUTH_FROM,
        })[name] || "",
      },
    ),
    /verification must complete/u,
  );
  assert.equal(calls.length, 1);
});

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createQueuedFetch(calls, responses) {
  return async (url, init = {}) => {
    calls.push({
      url: String(url),
      method: String(init.method || "GET").toUpperCase(),
      body: init.body ? String(init.body) : "",
    });
    const response = responses.shift();
    if (!response) throw new Error(`Unexpected fetch: ${url}`);
    return response;
  };
}
