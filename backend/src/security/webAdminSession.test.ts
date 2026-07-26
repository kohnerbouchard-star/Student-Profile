import {
  constantTimeTextEqual,
  createWebAdminSessionPayload,
  openWebAdminSession,
  parseCookieHeader,
  sealWebAdminSession,
  WEB_ADMIN_SESSION_ABSOLUTE_SECONDS,
} from "./webAdminSession.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const KEY = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const NOW = 1_785_062_400;

Deno.test("seals and opens an authenticated Admin web session", async () => {
  const payload = createWebAdminSessionPayload({
    accessToken: "header.payload.signature",
    refreshToken: "refresh-token-value",
    accessExpiresAt: NOW + 3_600,
    csrfToken: "A".repeat(43),
    nowSeconds: NOW,
    user: {
      id: "staff-user",
      email: "teacher@example.com",
      role: "game_admin",
      permissionVersion: 1,
      securityVersion: 1,
    },
  });
  const envelope = await sealWebAdminSession(payload, KEY);
  const opened = await openWebAdminSession(envelope, KEY, NOW + 60);

  assertEquals(opened, payload);
  assertEquals(opened.absoluteExpiresAt - opened.issuedAt, WEB_ADMIN_SESSION_ABSOLUTE_SECONDS);
  assertEquals(envelope.includes("teacher@example.com"), false);
  assertEquals(envelope.includes("refresh-token-value"), false);
});

Deno.test("rejects tampered and expired Admin web sessions", async () => {
  const payload = createWebAdminSessionPayload({
    accessToken: "header.payload.signature",
    refreshToken: "refresh-token-value",
    accessExpiresAt: NOW + 3_600,
    csrfToken: "B".repeat(43),
    nowSeconds: NOW,
    user: {
      id: "staff-user",
      email: "teacher@example.com",
      role: "game_admin",
      permissionVersion: 1,
      securityVersion: 1,
    },
  });
  const envelope = await sealWebAdminSession(payload, KEY);
  await assertRejects(() =>
    openWebAdminSession(`${envelope.slice(0, -1)}A`, KEY, NOW + 60)
  );
  await assertRejects(() =>
    openWebAdminSession(
      envelope,
      KEY,
      NOW + WEB_ADMIN_SESSION_ABSOLUTE_SECONDS + 1,
    )
  );
});

Deno.test("parses only bounded cookie material and compares CSRF in constant work", () => {
  const cookies = parseCookieHeader(
    "safe_cookie=v1.alpha.beta; bad cookie=value; injected=bad%0d%0a; empty=",
  );
  assertEquals(cookies.get("safe_cookie"), "v1.alpha.beta");
  assertEquals(cookies.has("bad cookie"), false);
  assertEquals(cookies.has("injected"), false);
  assertEquals(cookies.get("empty"), "");
  assertEquals(constantTimeTextEqual("same", "same"), true);
  assertEquals(constantTimeTextEqual("same", "different"), false);
});

async function assertRejects(run: () => Promise<unknown>): Promise<void> {
  let rejected = false;
  try {
    await run();
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("Expected promise to reject.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}
