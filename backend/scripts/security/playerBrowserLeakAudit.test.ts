import {
  auditBrowserPaths,
  auditBrowserText,
} from "./playerBrowserLeakAudit.ts";

Deno.test("browser leak audit detects literal credentials and sensitive browser sinks", () => {
  const findings = auditBrowserText(
    "fixture.js",
    [
      'console.log("session token", playerSessionToken);',
      "node.textContent = internalPlayerUuid;",
      'sessionStorage.setItem("accessCode", accessCode);',
      'const service_role_key = "this-is-a-realistic-service-role-secret";',
      'const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signaturebytes";',
    ].join("\n"),
  );

  assertEquals(
    findings.map((finding) => finding.code),
    [
      "sensitive_console_sink",
      "sensitive_dom_sink",
      "sensitive_storage_sink",
      "supabase_service_role_literal",
      "jwt_literal",
    ],
  );
  assert(findings.every((finding) => finding.excerpt.length <= 120));
  const serializedFindings = JSON.stringify(findings);
  assert(!serializedFindings.includes("realistic-service-role-secret"));
  assert(!serializedFindings.includes("eyJhbGciOiJIUzI1NiJ9"));
});

Deno.test("browser leak audit permits in-memory transport without logging, rendering, or persisting credentials", () => {
  const findings = auditBrowserText(
    "http-transport.js",
    [
      "const token = context.session.playerSessionToken;",
      'headers["x-player-session-token"] = token;',
      "return fetch(path, { headers });",
    ].join("\n"),
  );

  assertEquals(findings, []);
});

Deno.test("browser leak audit scans current Player Terminal source, preview evidence, and generated-artifact roots", async () => {
  const repositoryRoot = new URL("../../../", import.meta.url).pathname;
  const findings = await auditBrowserPaths([
    `${repositoryRoot}player-terminal/src`,
    `${repositoryRoot}player-terminal/index.html`,
    `${repositoryRoot}player-terminal/preview`,
    `${repositoryRoot}player-terminal/dist`,
    `${repositoryRoot}player-terminal/coverage`,
    `${repositoryRoot}player-terminal/playwright-report`,
    `${repositoryRoot}player-terminal/test-results`,
    `${repositoryRoot}artifacts`,
  ]);

  assertEquals(findings, []);
});

function assert(condition: boolean): void {
  if (!condition) {
    throw new Error("Assertion failed.");
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
