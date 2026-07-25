import { RateLimitError } from "./rateLimitContracts.ts";
import { readPlayerRateLimitConfig } from "./playerRateLimitService.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const SECRET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

Deno.test("request protection rejects x-forwarded-for chains and accepts one overwritten address header", () => {
  assertInvalid(() =>
    readPlayerRateLimitConfig((name) =>
      name === "ECONOVARIA_RATE_LIMIT_HMAC_SECRET"
        ? SECRET
        : "x-forwarded-for"
    )
  );

  const config = readPlayerRateLimitConfig((name) =>
    name === "ECONOVARIA_RATE_LIMIT_HMAC_SECRET"
      ? SECRET
      : "cf-connecting-ip"
  );

  if (config.trustedIpHeader !== "cf-connecting-ip") {
    throw new Error("Expected the single-value Cloudflare header.");
  }
});

function assertInvalid(run: () => unknown): void {
  try {
    run();
  } catch (error) {
    if (
      error instanceof RateLimitError &&
      error.code === "invalid_rate_limit_config"
    ) {
      return;
    }
    throw error;
  }
  throw new Error("Expected invalid_rate_limit_config.");
}
