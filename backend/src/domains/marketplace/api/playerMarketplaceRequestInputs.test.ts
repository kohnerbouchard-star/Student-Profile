import { PlayerMarketplaceError } from "../contracts/playerMarketplaceContracts.ts";
import { strictJsonObject, exactKeys, itemKey, idempotency, currency, condition, positiveInteger, nullableInteger, positiveNumber, boundedText } from "./playerMarketplaceRequestInputs.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}
async function rejects(run: () => unknown, message: string) {
  try { await run(); } catch (error) {
    if (!(error instanceof PlayerMarketplaceError)) throw error;
    equal([error.code, error.status, error.message, error.retryable], ["invalid_player_marketplace_request", 400, message, false]);
    return;
  }
  throw new Error("Expected validation error");
}
function request(body: string, headers: Record<string, string> = {}) {
  return new Request("https://example.invalid/marketplace", { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
}
Deno.test("Marketplace request inputs preserve successful normalization and numeric coercion", () => {
  equal(itemKey(" Widget_A "), "widget_a"); equal(currency(" usd "), "USD");
  equal(idempotency(" key-123456 "), "key-123456"); equal(condition(" Used "), "Used");
  equal(positiveInteger("2", "quantity", 3), 2); equal(positiveNumber("1.5", "price", 2), 1.5);
  equal(nullableInteger("", "duration", 1, 720), null); equal(nullableInteger(undefined, "duration", 1, 720), null);
  equal(nullableInteger(null, "duration", 1, 720), null); equal(nullableInteger("720", "duration", 1, 720), 720);
  equal(boundedText("  reason text  ", "reason", 10, 1000), "reason text");
  exactKeys({ a: null, b: undefined }, ["a", "b"]);
});
Deno.test("Marketplace scalar validation preserves exact failure messages and boundaries", async () => {
  await rejects(() => itemKey("!"), "itemKey is invalid.");
  await rejects(() => currency("US"), "currencyCode is invalid.");
  await rejects(() => idempotency("short"), "idempotencyKey is invalid.");
  await rejects(() => condition("used"), "condition is invalid.");
  for (const value of [0, -1, 1.1, Infinity, NaN, 4]) await rejects(() => positiveInteger(value, "quantity", 3), "quantity is invalid.");
  for (const value of [0, 721, 1.1]) await rejects(() => nullableInteger(value, "duration", 1, 720), "duration is invalid.");
  for (const value of [0, -1, Infinity, "wrong", 3]) await rejects(() => positiveNumber(value, "price", 2), "price is invalid.");
  await rejects(() => boundedText("short", "reason", 10, 1000), "reason is invalid.");
  for (const body of [{}, { a: 1, b: 2 }]) await rejects(() => exactKeys(body, ["a"]), "Marketplace request contains missing or unexpected fields.");
});
Deno.test("Marketplace body parsing preserves media type before length before JSON validation", async () => {
  equal(await strictJsonObject(request('{"a":1}')), { a: 1 });
  await rejects(() => strictJsonObject(request("bad", { "content-type": "text/plain", "content-length": "9000" })), "Marketplace write requests must use application/json.");
  await rejects(() => strictJsonObject(request("bad", { "content-length": "9000" })), "Marketplace request body is too large.");
  await rejects(() => strictJsonObject(request("bad")), "Marketplace request body must be valid JSON.");
  for (const body of ["null", "[]", "1"]) await rejects(() => strictJsonObject(request(body)), "Marketplace request body must be a JSON object.");
  await rejects(() => strictJsonObject(request(JSON.stringify({ a: "가".repeat(3000) }))), "Marketplace request body is too large.");
  const unreadable = request("{}");
  await unreadable.text();
  await rejects(() => strictJsonObject(unreadable), "Marketplace request body could not be read.");
});
