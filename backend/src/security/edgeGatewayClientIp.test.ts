import { bindGatewayTrustedClientIp } from "./edgeGatewayClientIp.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("gateway binding uses the rightmost forwarded address and strips aliases", async () => {
  const request = new Request("https://example.test/staff/signup", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-econovaria-device-id": "00000000-0000-4000-8000-000000000001",
      "x-forwarded-for": "198.51.100.7, 203.0.113.42",
      "true-client-ip": "198.51.100.8",
    },
    body: JSON.stringify({ ok: true }),
  });

  const bound = bindGatewayTrustedClientIp(request, "x-real-ip");

  assertEquals(bound.headers.get("x-real-ip"), "203.0.113.42");
  assertEquals(bound.headers.get("x-forwarded-for"), null);
  assertEquals(bound.headers.get("true-client-ip"), null);
  assertEquals(
    bound.headers.get("x-econovaria-device-id"),
    "00000000-0000-4000-8000-000000000001",
  );
  assertEquals(await bound.json(), { ok: true });
});

Deno.test("gateway binding preserves a valid configured gateway value", () => {
  const request = new Request("https://example.test", {
    headers: {
      "cf-connecting-ip": "203.0.113.9",
      "x-forwarded-for": "198.51.100.7, 198.51.100.8",
      authorization: "Bearer preserved",
    },
  });

  const bound = bindGatewayTrustedClientIp(request, "cf-connecting-ip");

  assertEquals(bound.headers.get("cf-connecting-ip"), "203.0.113.9");
  assertEquals(bound.headers.get("x-forwarded-for"), null);
  assertEquals(bound.headers.get("authorization"), "Bearer preserved");
});

Deno.test("gateway binding leaves invalid configuration fail closed", () => {
  const request = new Request("https://example.test", {
    headers: { "x-forwarded-for": "203.0.113.42" },
  });

  assert(
    bindGatewayTrustedClientIp(request, "x-forwarded-for") === request,
  );
  assert(
    bindGatewayTrustedClientIp(request, "client-ip") === request,
  );
});

function assert(value: unknown): asserts value {
  if (!value) throw new Error("Assertion failed.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  const actualValue = JSON.stringify(actual);
  const expectedValue = JSON.stringify(expected);
  if (actualValue !== expectedValue) {
    throw new Error(`Expected ${expectedValue}, received ${actualValue}.`);
  }
}
