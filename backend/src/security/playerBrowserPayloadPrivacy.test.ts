import { buildPlayerCapabilityManifest } from "../domains/players/contracts/playerCapabilityManifestContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SENSITIVE_KEY_PATTERN =
  /(?:access.?code|authorization|credential|hash|password|secret|service.?role|session.?token|token.?hash)/i;
const INTERNAL_IDENTIFIER_KEY_PATTERN =
  /(?:internal.*uuid|gameSession\.id|player\.id|session\.id)/i;

Deno.test("browser payload privacy: reviewed capability manifest contains no credential material or UUID values", () => {
  assertBoundarySafe(buildPlayerCapabilityManifest());
});

Deno.test("browser payload privacy: reviewed logout response contains no credential material or internal UUIDs", () => {
  assertBoundarySafe({
    ok: true,
    message: "Player session logged out.",
    alreadyLoggedOut: false,
    status: "revoked",
    revokedAt: "2026-07-18T00:00:00.000Z",
  });
});

Deno.test("browser payload privacy: generic public errors contain no request credentials or internal UUIDs", () => {
  for (
    const body of [
      {
        error: {
          code: "invalid_player_session",
          message: "Player session is invalid or expired.",
          retryable: false,
        },
      },
      {
        error: {
          code: "invalid_player_session_scope",
          message:
            "Requested game scope does not match the authenticated player session.",
          retryable: false,
        },
      },
    ]
  ) {
    assertBoundarySafe(body);
  }
});

Deno.test("browser payload privacy: legacy UUID-bearing bootstrap shapes are detected as blockers", () => {
  const findings = inspectBoundary({
    ok: true,
    gameSession: { id: "00000000-0000-4000-8000-000000000001" },
    player: { id: "00000000-0000-4000-8000-000000000021" },
    session: { id: "00000000-0000-4000-8000-000000000011" },
  });

  assertEquals(findings, [
    "gameSession.id exposes an internal identifier",
    "gameSession.id contains a UUID value",
    "player.id exposes an internal identifier",
    "player.id contains a UUID value",
    "session.id exposes an internal identifier",
    "session.id contains a UUID value",
  ]);
});

Deno.test("browser payload privacy: credential, token-hash, and plaintext-token fields are detected", () => {
  const findings = inspectBoundary({
    accessCode: "123456",
    sessionToken: "raw-session-token",
    sessionTokenHash: "hashed-session-token",
  });

  assertEquals(findings, [
    "accessCode uses a sensitive field name",
    "sessionToken uses a sensitive field name",
    "sessionTokenHash uses a sensitive field name",
  ]);
});

function assertBoundarySafe(value: unknown): void {
  const findings = inspectBoundary(value);
  if (findings.length > 0) {
    throw new Error(`Unsafe browser payload: ${findings.join("; ")}`);
  }
}

function inspectBoundary(value: unknown): readonly string[] {
  const findings: string[] = [];
  visit(value, "", findings);
  return findings;
}

function visit(value: unknown, path: string, findings: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      visit(entry, `${path}[${index}]`, findings)
    );
    return;
  }

  if (value === null || typeof value !== "object") {
    if (typeof value === "string" && UUID_PATTERN.test(value)) {
      findings.push(`${path || "<root>"} contains a UUID value`);
    }
    return;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key;
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      findings.push(`${childPath} uses a sensitive field name`);
      continue;
    }
    if (INTERNAL_IDENTIFIER_KEY_PATTERN.test(childPath)) {
      findings.push(`${childPath} exposes an internal identifier`);
    }
    visit(child, childPath, findings);
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
