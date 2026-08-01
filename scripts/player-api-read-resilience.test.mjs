import test from "node:test";
import assert from "node:assert/strict";

import {
  createStudentProfileReadResilientFetch,
} from "../player-terminal/src/integrations/student-profile-read-resilience.js";

const PLAYER_URL =
  "https://econovaria.example/api/player/players/me/world-runtime";

function response(status, body = { status }, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("retries transient Player BFF reads including worker-retirement 500s", async () => {
  const statuses = [500, 503, 200];
  const delays = [];
  const events = [];
  let calls = 0;
  const resilientFetch = createStudentProfileReadResilientFetch(
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
        status: 500,
        reason: "response",
        path: "/api/player/players/me/world-runtime",
      },
      {
        attempt: 2,
        nextAttempt: 3,
        status: 503,
        reason: "response",
        path: "/api/player/players/me/world-runtime",
      },
    ],
  );
});

test("returns the final transient response after three attempts", async () => {
  let calls = 0;
  const resilientFetch = createStudentProfileReadResilientFetch(
    async () => {
      calls += 1;
      return response(504);
    },
    { sleep: async () => {}, randomUint32: () => 0 },
  );

  const result = await resilientFetch(PLAYER_URL);
  assert.equal(result.status, 504);
  assert.equal(calls, 3);
});

test("never retries mutations or unrelated services", async () => {
  let calls = 0;
  const resilientFetch = createStudentProfileReadResilientFetch(
    async () => {
      calls += 1;
      return response(500);
    },
    { sleep: async () => {} },
  );

  const mutation = await resilientFetch(PLAYER_URL, {
    method: "POST",
    body: "{}",
  });
  const unrelated = await resilientFetch(
    "https://econovaria.example/api/admin/status",
  );

  assert.equal(mutation.status, 500);
  assert.equal(unrelated.status, 500);
  assert.equal(calls, 2);
});

test("retries a transient network failure for an idempotent Player read", async () => {
  let calls = 0;
  const events = [];
  const resilientFetch = createStudentProfileReadResilientFetch(
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
  const resilientFetch = createStudentProfileReadResilientFetch(
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

test("caps Retry-After so server hints cannot create unbounded stalls", async () => {
  const delays = [];
  let calls = 0;
  const resilientFetch = createStudentProfileReadResilientFetch(
    async () => {
      calls += 1;
      return calls === 1
        ? response(503, { status: 503 }, { "retry-after": "90" })
        : response(200);
    },
    {
      sleep: async (milliseconds) => delays.push(milliseconds),
      randomUint32: () => 0,
    },
  );

  assert.equal((await resilientFetch(PLAYER_URL)).status, 200);
  assert.deepEqual(delays, [1_000]);
});
