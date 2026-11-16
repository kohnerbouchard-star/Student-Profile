import assert from "node:assert/strict";
import { test } from "node:test";
import { AdapterTransport } from "../src/api/adapter-transport.js";

const context = { method: "GET", endpointKey: "session-test", path: "/test", requestId: "request-test" };
const tick = () => new Promise((resolve) => setImmediate(resolve));
function trackedSignal() {
  const caller = new AbortController();
  let listeners = 0;
  return {
    abort: () => caller.abort(),
    get listeners() { return listeners; },
    signal: {
      get aborted() { return caller.signal.aborted; },
      addEventListener(...args) { listeners++; caller.signal.addEventListener(...args); },
      removeEventListener(...args) { listeners--; caller.signal.removeEventListener(...args); },
    },
  };
}

// Fake only transport timers, making deadline and cleanup assertions deterministic.
await test("session acquisition shares request deadline, cancellation and cleanup", async (t) => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timers = new Map();
  const unhandled = [];
  const onUnhandled = (error) => unhandled.push(error);
  let nextTimer = 0;
  globalThis.setTimeout = (callback) => { timers.set(++nextTimer, callback); return nextTimer; };
  globalThis.clearTimeout = (id) => timers.delete(id);
  process.on("unhandledRejection", onUnhandled);
  try {
    for (const ending of ["timeout", "abort"]) {
      for (const late of ["pending", "resolve", "reject"]) {
        await t.test(`${ending}, provider ${late}`, async () => {
          let resolveSession, rejectSession;
          let calls = 0;
          const caller = trackedSignal();
          const signal = caller.signal;
          const transport = new AdapterTransport(() => { calls++; return { ok: true }; }, {
            requestTimeoutMs: 10,
            sessionProvider: () => new Promise((resolve, reject) => { resolveSession = resolve; rejectSession = reject; }),
          });
          const result = transport.request({ ...context, signal });
          const checked = assert.rejects(result, (error) => {
            assert.equal(error.code, ending === "timeout" ? "REQUEST_TIMEOUT" : "REQUEST_ABORTED");
            assert.equal(error.requestId, context.requestId);
            return true;
          });
          await tick();
          if (ending === "timeout") [...timers.values()][0]();
          else caller.abort();
          await checked;
          assert.equal(timers.size, 0);
          assert.equal(caller.listeners, 0);
          if (late === "resolve") resolveSession({ authenticated: true });
          if (late === "reject") rejectSession(new Error("late provider failure"));
          await tick();
          assert.equal(calls, 0, "Late sessions must not invoke adapters");
        });
      }
    }
    await t.test("pre-aborted requests skip provider and adapter", async () => {
      const caller = new AbortController(); caller.abort();
      let calls = 0;
      const transport = new AdapterTransport(() => { calls++; }, { sessionProvider: () => { calls++; } });
      await assert.rejects(transport.request({ ...context, signal: caller.signal }), { code: "REQUEST_ABORTED" });
      assert.equal(calls, 0);
      assert.equal(timers.size, 0);
    });
    for (const failure of ["throw", "reject"]) {
      await t.test(`provider ${failure} normalizes and cleans up`, async () => {
        const error = new Error("private provider failure");
        const caller = trackedSignal();
        const transport = new AdapterTransport(() => assert.fail("adapter invoked"), {
          sessionProvider: () => { if (failure === "throw") throw error; return Promise.reject(error); },
        });
        await assert.rejects(transport.request({ ...context, signal: caller.signal }), (result) => {
          assert.equal(result.code, "REQUEST_FAILED");
          assert.equal(result.requestId, context.requestId);
          assert.equal(result.cause, error);
          assert.equal(result.message.includes(error.message), false);
          return true;
        });
        assert.equal(timers.size, 0);
        assert.equal(caller.listeners, 0);
      });
    }
    await t.test("successful provider preserves context and result", async () => {
      const session = { authenticated: true, csrfToken: "csrf", gameSessionId: "game" };
      const response = { ok: true, items: [] };
      const caller = trackedSignal();
      const transport = new AdapterTransport((received) => {
        assert.deepEqual(received.session, session);
        assert.equal(received.signal.aborted, false);
        assert.equal(received.requestId, context.requestId);
        return response;
      }, { sessionProvider: async () => session });
      assert.equal(await transport.request({ ...context, signal: caller.signal }), response);
      assert.equal(caller.listeners, 0);
      assert.equal(timers.size, 0);
    });
    await tick();
    assert.deepEqual(unhandled, []);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    process.removeListener("unhandledRejection", onUnhandled);
  }
});
