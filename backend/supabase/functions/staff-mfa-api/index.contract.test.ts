declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: URL): Promise<string>;
};

Deno.test("Staff MFA normalizes gateway IP before session protection", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const binding = source.indexOf("bindGatewayTrustedClientIp(");
  const publishableCheck = source.indexOf("requirePublishableRequest(request)");
  const sessionResolution = source.indexOf("resolveStaffSessionForRequest(");

  assert(binding >= 0, "gateway trusted-IP binding is required");
  assert(publishableCheck > binding, "publishable validation must use the bound request");
  assert(sessionResolution > binding, "staff session protection must use the bound request");
  assert(
    source.includes('Deno.env.get("ECONOVARIA_TRUSTED_CLIENT_IP_HEADER")'),
    "runtime trusted-IP header selection must remain authoritative",
  );
});

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
