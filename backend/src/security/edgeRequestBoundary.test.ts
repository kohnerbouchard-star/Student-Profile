import { enforceEdgeRequestBoundary } from "./edgeRequestBoundary.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const policy = {
  allowedMethods: ["GET", "POST"],
  maxBodyBytes: 32,
  requireJsonBody: true,
} as const;

Deno.test("accepts and reconstructs a bounded JSON request", async () => {
  const result = await enforceEdgeRequestBoundary(
    new Request("https://example.test/route", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true }),
    }),
    policy,
  );
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(await result.request.json(), { ok: true });
});

Deno.test("rejects wrong methods and media types", async () => {
  const wrongMethod = await enforceEdgeRequestBoundary(
    new Request("https://example.test", { method: "DELETE" }),
    policy,
  );
  assertEquals(wrongMethod.ok, false);
  if (!wrongMethod.ok) assertEquals(wrongMethod.response.status, 405);

  const wrongType = await enforceEdgeRequestBoundary(
    new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hello",
    }),
    policy,
  );
  assertEquals(wrongType.ok, false);
  if (!wrongType.ok) assertEquals(wrongType.response.status, 415);
});

Deno.test("rejects bodies above the actual byte limit", async () => {
  const result = await enforceEdgeRequestBoundary(
    new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(64) }),
    }),
    policy,
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.response.status, 413);
});

Deno.test("rejects a body on a GET request", async () => {
  const result = await enforceEdgeRequestBoundary(
    new Request("https://example.test", {
      method: "GET",
      headers: { "content-length": "1" },
    }),
    policy,
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.response.status, 400);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}
