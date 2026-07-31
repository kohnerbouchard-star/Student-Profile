declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: URL): Promise<string>;
};

Deno.test("Admin rate limiting normalizes gateway IP before trusted-IP extraction", async () => {
  const source = await Deno.readTextFile(
    new URL("./progressionRateLimit.ts", import.meta.url),
  );

  const binding = source.indexOf("bindGatewayTrustedClientIp(");
  const extraction = source.indexOf("readTrustedClientIp(");
  const rpc = source.indexOf('"consume_request_rate_limits_v1"');

  assert(binding >= 0, "Admin rate limiting must bind gateway client IP metadata");
  assert(
    extraction > binding,
    "trusted-IP extraction must use the gateway-normalized request",
  );
  assert(rpc > extraction, "rate-limit RPC must run after trusted-IP extraction");
  assert(
    source.includes("configuredHeader === \"x-forwarded-for\""),
    "x-forwarded-for must remain prohibited as the authoritative configured header",
  );
  assert(
    source.includes("readTrustedClientIp(\n    normalizedRequest,"),
    "the normalized request must be passed to trusted-IP extraction",
  );
});

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
