import { enforceEdgeRequestBoundary } from "./edgeRequestBoundary.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const policy = {
  allowedMethods: ["GET", "POST"],
  maxBodyBytes: 32,
  requireJsonBody: true,
} as const;

Deno.test("accepts and reconstructs a bounded JSON request", async () => {
  const result = await enforceEdgeRequestBoundary(
    new Request("https://example.test/route", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true }),
    }),
    policy,
  );
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(await result.request.json(), { ok: true });
});

Deno.test("rejects wrong methods and media types", async () => {
  const wrongMethod = await enforceEdgeRequestBoundary(
    new Request("https://example.test", { method: "DELETE" }),
    policy,
  );
  assertEquals(wrongMethod.ok, false);
  if (!wrongMethod.ok) assertEquals(wrongMethod.response.status, 405);

  const wrongType = await enforceEdgeRequestBoundary(
    new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hello",
    }),
    policy,
  );
  assertEquals(wrongType.ok, false);
  if (!wrongType.ok) assertEquals(wrongType.response.status, 415);
});

Deno.test("rejects bodies above the actual byte limit", async () => {
  const result = await enforceEdgeRequestBoundary(
    new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(64) }),
    }),
    policy,
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.response.status, 413);
});

Deno.test("stops and cancels a streamed body as soon as it exceeds the limit", async () => {
  let pulls = 0;
  let cancellations = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(8));
      if (pulls === 12) controller.close();
    },
    cancel() {
      cancellations += 1;
    },
  }, { highWaterMark: 0 });

  const request = new Request("https://example.test/route", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
  });
  assertEquals(request.headers.has("content-length"), false);
  const result = await enforceEdgeRequestBoundary(request, policy);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.response.status, 413);
    assertEquals(
      (await result.response.json()).error.code,
      "request_body_too_large",
    );
  }
  assertEquals(pulls, 5);
  assertEquals(cancellations, 1);
});

Deno.test("does not read past an oversized first chunk even with understated length", async () => {
  let pulls = 0;
  let cancellations = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(64));
      if (pulls === 3) controller.close();
    },
    cancel() {
      cancellations += 1;
    },
  }, { highWaterMark: 0 });

  const result = await enforceEdgeRequestBoundary(
    new Request("https://example.test/route", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "1" },
      body: stream,
    }),
    policy,
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.response.status, 413);
  assertEquals(pulls, 1);
  assertEquals(cancellations, 1);
});

Deno.test("rejects without waiting for an unresponsive stream cancellation", async () => {
  let cancelStarted = false;
  let pulls = 0;
  let completeCancellation = () => {};
  const cancellation = new Promise<void>((resolve) => {
    completeCancellation = resolve;
  });
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(64));
      if (++pulls === 2) controller.close();
    },
    cancel() {
      cancelStarted = true;
      return cancellation;
    },
  }, { highWaterMark: 0 });
  const resultPromise = enforceEdgeRequestBoundary(
    new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
    policy,
  );
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      resultPromise,
      new Promise<"timeout">((resolve) => {
        timeout = setTimeout(() => resolve("timeout"), 1_000);
      }),
    ]);
    assertEquals(result === "timeout", false);
    if (result !== "timeout") {
      assertEquals(result.ok, false);
      if (!result.ok) assertEquals(result.response.status, 413);
    }
    assertEquals(cancelStarted, true);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    completeCancellation();
    await resultPromise;
  }
});

Deno.test("returns 413 even if stream cancellation fails", async () => {
  let cancelled = false;
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(64));
      if (++pulls === 2) controller.close();
    },
    cancel() {
      cancelled = true;
      throw new Error("cancellation failed");
    },
  }, { highWaterMark: 0 });
  const result = await enforceEdgeRequestBoundary(
    new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
    policy,
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.response.status, 413);
  assertEquals(cancelled, true);
});

Deno.test("rejects oversized declared length without reading the body", async () => {
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(1));
      controller.close();
    },
  }, { highWaterMark: 0 });
  const result = await enforceEdgeRequestBoundary(
    new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "33" },
      body,
    }),
    policy,
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.response.status, 413);
  assertEquals(pulls, 0);
});

Deno.test("reconstructs exact bytes at the boundary", async () => {
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulls === 4) {
        controller.close();
        return;
      }
      controller.enqueue(new Uint8Array(8).fill(++pulls));
    },
  }, { highWaterMark: 0 });
  const request = new Request("https://example.test/route?x=1", {
    method: "POST",
    headers: { "content-type": "application/json", "x-test": "preserved" },
    redirect: "manual",
    body: stream,
  });
  const result = await enforceEdgeRequestBoundary(request, policy);
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.request.url, request.url);
    assertEquals(result.request.method, request.method);
    assertEquals(result.request.redirect, "manual");
    assertEquals(result.request.headers.get("x-test"), "preserved");
    assertEquals(
      [...new Uint8Array(await result.request.arrayBuffer())],
      [
        ...new Array(8).fill(1),
        ...new Array(8).fill(2),
        ...new Array(8).fill(3),
        ...new Array(8).fill(4),
      ],
    );
  }
});

Deno.test("preserves all bytes while growing to the bootstrap limit", async () => {
  const expected = Uint8Array.from(
    { length: 32_768 },
    (_, index) => index % 251,
  );
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === expected.length) {
        controller.close();
        return;
      }
      const end = Math.min(offset + 257, expected.length);
      controller.enqueue(expected.subarray(offset, end));
      offset = end;
    },
  }, { highWaterMark: 0 });
  const result = await enforceEdgeRequestBoundary(
    new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
    { ...policy, maxBodyBytes: 32_768 },
  );
  assertEquals(result.ok, true);
  if (result.ok) {
    const actual = new Uint8Array(await result.request.arrayBuffer());
    assertEquals(actual.byteLength, expected.byteLength);
    for (let index = 0; index < expected.length; index += 1) {
      if (actual[index] !== expected[index]) {
        throw new Error(`Body differs at byte ${index}.`);
      }
    }
  }
});

Deno.test("retains empty, consumed and unreadable body failures", async () => {
  const empty = await enforceEdgeRequestBoundary(
    new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
    }),
    policy,
  );
  assertEquals(empty.ok, false);
  if (!empty.ok) {
    assertEquals(
      (await empty.response.json()).error.code,
      "request_body_required",
    );
  }

  const consumed = new Request("https://example.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  await consumed.text();
  const consumedResult = await enforceEdgeRequestBoundary(consumed, policy);
  assertEquals(consumedResult.ok, false);
  if (!consumedResult.ok) {
    assertEquals(
      (await consumedResult.response.json()).error.code,
      "invalid_request_body",
    );
  }

  const unreadable = await enforceEdgeRequestBoundary(
    new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(new Error("read failed"));
        },
      }),
    }),
    policy,
  );
  assertEquals(unreadable.ok, false);
  if (!unreadable.ok) {
    assertEquals(
      (await unreadable.response.json()).error.code,
      "invalid_request_body",
    );
  }
});

Deno.test("retains optional empty-body support", async () => {
  const result = await enforceEdgeRequestBoundary(
    new Request("https://example.test", { method: "POST" }),
    { ...policy, requireJsonBody: false },
  );
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals((await result.request.arrayBuffer()).byteLength, 0);
  }
});

Deno.test("applies a zero-byte limit while retaining optional empty bodies", async () => {
  const zero = { ...policy, maxBodyBytes: 0, requireJsonBody: false };
  const empty = await enforceEdgeRequestBoundary(
    new Request("https://example.test", { method: "POST" }),
    zero,
  );
  assertEquals(empty.ok, true);
  if (empty.ok) assertEquals((await empty.request.arrayBuffer()).byteLength, 0);

  const nonempty = await enforceEdgeRequestBoundary(
    new Request("https://example.test", { method: "POST", body: "x" }),
    zero,
  );
  assertEquals(nonempty.ok, false);
  if (!nonempty.ok) assertEquals(nonempty.response.status, 413);
});

Deno.test("applies the limit to UTF-8 bytes rather than characters", async () => {
  const request = (text: string) =>
    new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: text,
    });
  const exact = await enforceEdgeRequestBoundary(
    request("é".repeat(16)),
    policy,
  );
  assertEquals(exact.ok, true);
  if (exact.ok) assertEquals(await exact.request.text(), "é".repeat(16));
  const oversized = await enforceEdgeRequestBoundary(
    request("é".repeat(17)),
    policy,
  );
  assertEquals(oversized.ok, false);
  if (!oversized.ok) assertEquals(oversized.response.status, 413);
});

Deno.test("preserves independent limits for concurrent streamed requests", async () => {
  const pulls = Array<number>(8).fill(0);
  const cancellations = Array<number>(8).fill(0);
  const results = await Promise.all(pulls.map((_, index) => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls[index] += 1;
        controller.enqueue(new Uint8Array(16));
        if (pulls[index] === 8) controller.close();
      },
      cancel() {
        cancellations[index] += 1;
      },
    }, { highWaterMark: 0 });
    return enforceEdgeRequestBoundary(
      new Request("https://example.test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
      policy,
    );
  }));
  assertEquals(
    results.map((result) => result.ok ? 200 : result.response.status),
    Array(8).fill(413),
  );
  assertEquals(pulls, Array(8).fill(3));
  assertEquals(cancellations, Array(8).fill(1));
});

Deno.test("rejects a body on a GET request", async () => {
  const result = await enforceEdgeRequestBoundary(
    new Request("https://example.test", {
      method: "GET",
      headers: { "content-length": "1" },
    }),
    policy,
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.response.status, 400);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }.`,
    );
  }
}
