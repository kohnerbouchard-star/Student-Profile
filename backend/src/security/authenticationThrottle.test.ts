import {
  ECONOVARIA_DEVICE_ID_HEADER,
  normalizeAccountIdentifier,
  readDeviceId,
} from "./authenticationThrottle.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("normalizes account identifiers without retaining raw case", () => {
  assertEquals(
    normalizeAccountIdentifier(" Teacher@Example.COM "),
    "teacher@example.com",
  );
});

Deno.test("rejects empty and control-character account identifiers", () => {
  assertThrows(() => normalizeAccountIdentifier("   "));
  assertThrows(() => normalizeAccountIdentifier("teacher@example.com\nspoof"));
});

Deno.test("accepts only version 4 opaque device identifiers", () => {
  const request = new Request("https://example.test", {
    headers: {
      [ECONOVARIA_DEVICE_ID_HEADER]:
        "123e4567-e89b-42d3-a456-426614174000",
    },
  });
  assertEquals(
    readDeviceId(request),
    "123e4567-e89b-42d3-a456-426614174000",
  );

  assertThrows(() => readDeviceId(new Request("https://example.test")));
  assertThrows(() =>
    readDeviceId(new Request("https://example.test", {
      headers: { [ECONOVARIA_DEVICE_ID_HEADER]: "browser-fingerprint" },
    }))
  );
});

function assertThrows(run: () => unknown): void {
  let threw = false;
  try {
    run();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("Expected operation to throw.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}
