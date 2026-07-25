import assert from "node:assert/strict";
import test from "node:test";
import {
  ECONOVARIA_DEVICE_ID_HEADER,
  normalizeAccountIdentifier,
  readDeviceId,
} from "./authenticationThrottle.ts";

test("normalizes account identifiers without retaining raw case", () => {
  assert.equal(normalizeAccountIdentifier(" Teacher@Example.COM "), "teacher@example.com");
});

test("rejects empty and control-character account identifiers", () => {
  assert.throws(() => normalizeAccountIdentifier("   "));
  assert.throws(() => normalizeAccountIdentifier("teacher@example.com\nspoof"));
});

test("accepts only version 4 opaque device identifiers", () => {
  const request = new Request("https://example.test", {
    headers: {
      [ECONOVARIA_DEVICE_ID_HEADER]: "123e4567-e89b-42d3-a456-426614174000",
    },
  });
  assert.equal(readDeviceId(request), "123e4567-e89b-42d3-a456-426614174000");

  assert.throws(() => readDeviceId(new Request("https://example.test")));
  assert.throws(() => readDeviceId(new Request("https://example.test", {
    headers: { [ECONOVARIA_DEVICE_ID_HEADER]: "browser-fingerprint" },
  })));
});
