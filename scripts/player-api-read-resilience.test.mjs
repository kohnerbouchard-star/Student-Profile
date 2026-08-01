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

test("retries only explicitly classified worker-retirement 500s", async () => {
  const statuses = [
    response(500, { message: "WorkerAlreadyRetired: worker has already retired" }),
    response(503),
    response(200),
  ];
  const delays = [];
  const events = [];
  let calls = 0;
  const resilientFetch = createStudentProfileReadResilientFetch(
    async () => statuses[calls++],
    {
      maxAttempts: 3,
      baseDelayMs: 200,
      maxJitterMs: 300,
      randomUint32: () => 5,
      sleep: async (milliseconds) => delays.push(milliseconds),
      onEvent: (event) => events.push(event),
    },
  );

  const result = await resilientFetch(PLAYER_URL);
  assert.equal(result.status, 200);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [205, 405]);
  assert.deepEqual(
    events.map(({ type, status, classification }) => ({ type, status, classification })),
    [
      { type: "retry_scheduled", status: 500, classification: "worker_retired" },
      { type: "retry_scheduled", status: 503, classification: "service_unavailable" },
      { type: "retry_recovered", status: 200, classification: "recovered" },
    ],
  );
});

test("accepts the reviewed BFF worker-retirement response marker", async () => {
  let calls = 0;
  const resilientFetch = createStudentProfileReadResilientFetch(
    async () => {
      calls += 1;
      return calls === 1
        ? response(500, { message: "Internal Server Error" }, {
          "x-econovaria-retryable": "worker-retired",
        })
        : response(200);
    },
    { sleep: async () => {}, randomUint32: () => 0 },
  );

  assert.equal((await resilientFetch(PLAYER_URL)).status, 200);
  assert.equal(calls, 2);
});

test("does not retry an ordinary application 500", async () => {
  let calls = 0;
  const resilientFetch = createStudentProfileReadResilientFetch(
    async () => {
      calls += 1;
      return response(500, { code: "APPLICATION_BUG", message: "deterministic failure" });
    },
    { sleep: async () => {} },
  );

  assert.equal((await resilientFetch(PLAYER_URL)).status, 500);
  assert.equal(calls, 1);
});

test("does not retry a deterministic Supabase boot failure", async () => {
  let calls = 0;
  const resilientFetch = createStudentProfileReadResilientFetch(
    async () => {
      calls += 1;
      return response(503, {
        code: "BOOT_ERROR",
        message: "Function failed to start (please check logs)",
      });
    },
    { sleep: async () => {} },
  );

  assert.equal((await resilientFetch(PLAYER_URL)).status, 503);
  assert.equal(calls, 1);
});

test("returns the final transient response after three attempts", async () => {
  let calls = 0;
  const events = [];
  const resilientFetch = createStudentProfileReadResilientFetch(
    async () => {
      calls += 1;
      return response(504);
    },
    {
      sleep: async () => {},
      randomUint32: () => 0,
      onEvent: (event) => events.push(event),
    },
  );

  const result = await resilientFetch(PLAYER_URL);
  assert.equal(result.status, 504);
  assert.equal(calls, 3);
  assert.equal(events.at(-1).type, "retry_exhausted");
});

test("retries Supabase worker resource-limit responses", async () => {
  let calls = 0;
  const resilientFetch = createStudentProfileReadResilientFetch(
    async () => {
      calls += 1;
      return calls === 1 ? response(546) : response(200);
    },
    { sleep: async () => {}, randomUint32: () => 0 },
  );

  assert.equal((await resilientFetch(PLAYER_URL)).status, 200);
  assert.equal(calls, 2);
});

test("never retries mutations or unrelated services", async () => {
  let calls = 0;
  const resilientFetch = createStudentProfileReadResilientFetch(
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
    "https://econovaria.example/api/admin/status",
  );

  assert.equal(mutation.status, 503);
  assert.equal(unrelated.status, 503);
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
      onEvent: (event) => events.push(event),
    },
  );

  assert.equal((await resilientFetch(PLAYER_URL)).status, 200);
  assert.equal(calls, 2);
  assert.equal(events[0].reason, "network");
  assert.equal(events[0].status, null);
  assert.equal(events[1].type, "retry_recovered");
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

test("respects numeric and HTTP-date Retry-After values within the retry budget", async () => {
  const epoch = 1_800_000_000_000;
  const delays = [];
  let calls = 0;
  const resilientFetch = createStudentProfileReadResilientFetch(
    async () => {
      calls += 1;
      if (calls === 1) return response(503, {}, { "retry-after": "1" });
      if (calls === 2) {
        return response(503, {}, {
          "retry-after": new Date(epoch + 2_000).toUTCString(),
        });
      }
      return response(200);
    },
    {
      maxRetryElapsedMs: 5_000,
      wallClockNow: () => epoch,
      monotonicNow: () => 0,
      sleep: async (milliseconds) => delays.push(milliseconds),
      randomUint32: () => 0,
    },
  );

  assert.equal((await resilientFetch(PLAYER_URL)).status, 200);
  assert.deepEqual(delays, [1_000, 2_000]);
});

test("fails fast when Retry-After exceeds the remaining interactive budget", async () => {
  const delays = [];
  const events = [];
  let calls = 0;
  const resilientFetch = createStudentProfileReadResilientFetch(
    async () => {
      calls += 1;
      return response(503, {}, { "retry-after": "90" });
    },
    {
      maxRetryElapsedMs: 3_000,
      monotonicNow: () => 0,
      sleep: async (milliseconds) => delays.push(milliseconds),
      onEvent: (event) => events.push(event),
    },
  );

  assert.equal((await resilientFetch(PLAYER_URL)).status, 503);
  assert.equal(calls, 1);
  assert.deepEqual(delays, []);
  assert.equal(events[0].type, "retry_budget_exhausted");
  assert.equal(events[0].retryAfterMs, 90_000);
});

test("sanitizes retry telemetry paths", async () => {
  const events = [];
  let calls = 0;
  const url = "https://econovaria.example/api/player/contracts/11111111-1111-4111-8111-111111111111?secret=never-log";
  const resilientFetch = createStudentProfileReadResilientFetch(
    async () => {
      calls += 1;
      return calls === 1 ? response(502) : response(200);
    },
    {
      sleep: async () => {},
      randomUint32: () => 0,
      onEvent: (event) => events.push(event),
    },
  );

  assert.equal((await resilientFetch(url)).status, 200);
  assert.equal(events[0].path.includes("secret"), false);
  assert.equal(events[0].path.includes("11111111-1111-4111-8111-111111111111"), false);
  assert.match(events[0].path, /:dynamic/u);
});
