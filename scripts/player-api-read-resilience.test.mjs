import test from "node:test";
import assert from "node:assert/strict";

import {
  createPlayerApiReadResilientFetch,
} from "../backend/supabase/functions/_shared/playerApiReadResilience.ts";

const PLAYER_URL =
  "https://example.supabase.co/functions/v1/player-api/players/me/world-runtime";

function response(status, body = { status }) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("retries transient Player API reads with bounded exponential jitter", async () => {
  const statuses = [503, 502, 200];
  const delays = [];
  const events = [];
  let calls = 0;
  const resilientFetch = createPlayerApiReadResilientFetch(
    async () => response(statuses[calls++]),
    {
      maxAttempts: 3,
      baseDelayMs: 40,
      maxJitterMs: 60,
      randomUint32: () => 5,
      sleep: async (milliseconds) => delays.push(milliseconds),
      onRetry: (event) => events.push(event),
    },
  );

  const result = await resilientFetch(PLAYER_URL);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { status: 200 });
  assert.equal(calls, 3);
  assert.deepEqual(delays, [45, 85]);
  assert.deepEqual(
    events.map(({ attempt, nextAttempt, status, reason, path }) => ({
      attempt,
      nextAttempt,
      status,
      reason,
      path,
    })),
    [
      {
        attempt: 1,
        nextAttempt: 2,
        status: 503,
        reason: "response",
        path: "/functions/v1/player-api/players/me/world-runtime",
      },
      {
        attempt: 2,
        nextAttempt: 3,
        status: 502,
        reason: "response",
        path: "/functions/v1/player-api/players/me/world-runtime",
      },
    ],
  );
});

test("returns the final transient response after the third attempt", async () => {
  let calls = 0;
  const resilientFetch = createPlayerApiReadResilientFetch(
    async () => {
      calls += 1;
      return response(503);
    },
    { sleep: async () => {}, randomUint32: () => 0 },
  );

  const result = await resilientFetch(PLAYER_URL);
  assert.equal(result.status, 503);
  assert.equal(calls, 3);
});

test("never retries mutations or unrelated upstreams", async () => {
  let calls = 0;
  const resilientFetch = createPlayerApiReadResilientFetch(
    async () => {
      calls += 1;
      return response(503);
    },
    { sleep: async () => {} },
  );

  const mutation = await resilientFetch(PLAYER_URL, {
    method: "POST",
    body: "{}",
  });
  const unrelated = await resilientFetch(
    "https://example.supabase.co/functions/v1/other-api/status",
  );

  assert.equal(mutation.status, 503);
  assert.equal(unrelated.status, 503);
  assert.equal(calls, 2);
});

test("retries a transient network failure for an idempotent read", async () => {
  let calls = 0;
  const events = [];
  const resilientFetch = createPlayerApiReadResilientFetch(
    async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("connection reset");
      return response(200);
    },
    {
      sleep: async () => {},
      randomUint32: () => 0,
      onRetry: (event) => events.push(event),
    },
  );

  assert.equal((await resilientFetch(PLAYER_URL)).status, 200);
  assert.equal(calls, 2);
  assert.equal(events[0].reason, "network");
  assert.equal(events[0].status, null);
});

test("honors request cancellation during retry backoff", async () => {
  const controller = new AbortController();
  let calls = 0;
  const resilientFetch = createPlayerApiReadResilientFetch(
    async () => {
      calls += 1;
      return response(503);
    },
    {
      sleep: async (_milliseconds, signal) => {
        controller.abort(new DOMException("cancelled", "AbortError"));
        throw signal.reason;
      },
      randomUint32: () => 0,
    },
  );

  await assert.rejects(
    () => resilientFetch(PLAYER_URL, { signal: controller.signal }),
    (error) => error?.name === "AbortError",
  );
  assert.equal(calls, 1);
});
