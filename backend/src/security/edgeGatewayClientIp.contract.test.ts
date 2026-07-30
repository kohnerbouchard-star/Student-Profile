import {
  bindGatewayTrustedClientIp,
} from "./edgeGatewayClientIp.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("bootstrap gateway binding retains required signup headers", async () => {
  const request = new Request("https://example.test/functions/v1/bootstrap-api/staff/signup", {
    method: "POST",
    headers: {
      apikey: "sb_publishable_test",
      "content-type": "application/json",
      "x-econovaria-device-id": "00000000-0000-4000-8000-000000000001",
      "x-forwarded-for": "198.51.100.1, 203.0.113.42",
    },
    body: JSON.stringify({ email: "test@example.com" }),
  });

  const bound = bindGatewayTrustedClientIp(request, "x-real-ip");

  assertEquals(bound.headers.get("x-real-ip"), "203.0.113.42");
  assertEquals(bound.headers.get("apikey"), "sb_publishable_test");
  assertEquals(
    bound.headers.get("x-econovaria-device-id"),
    "00000000-0000-4000-8000-000000000001",
  );
  assertEquals(await bound.json(), { email: "test@example.com" });
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}
