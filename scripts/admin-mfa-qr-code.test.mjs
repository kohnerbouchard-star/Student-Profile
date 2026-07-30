import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMfaQrCode } from "../backend/supabase/functions/staff-mfa-api/mfaQrCode.ts";

const SAFE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><path d="M0 0h2v2H0z"/></svg>';

function decodeSvg(dataUrl) {
  const prefix = "data:image/svg+xml;base64,";
  assert.ok(dataUrl.startsWith(prefix));
  return Buffer.from(dataUrl.slice(prefix.length), "base64").toString("utf8");
}

test("normalizes Supabase UTF-8 SVG data URLs to base64", () => {
  const normalized = normalizeMfaQrCode(`data:image/svg+xml;utf-8,${SAFE_SVG}`);
  assert.equal(decodeSvg(normalized), SAFE_SVG);
});

test("normalizes percent-encoded Supabase UTF-8 SVG data URLs", () => {
  const normalized = normalizeMfaQrCode(
    `data:image/svg+xml;utf8,${encodeURIComponent(SAFE_SVG)}`,
  );
  assert.equal(decodeSvg(normalized), SAFE_SVG);
});

test("normalizes bare SVG QR payloads", () => {
  const normalized = normalizeMfaQrCode(SAFE_SVG);
  assert.equal(decodeSvg(normalized), SAFE_SVG);
});

test("preserves already normalized image data URLs", () => {
  const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
  assert.equal(normalizeMfaQrCode(dataUrl), dataUrl);
});

test("rejects active or externally-referenced SVG content", () => {
  assert.equal(normalizeMfaQrCode('<svg onload="alert(1)"></svg>'), "");
  assert.equal(normalizeMfaQrCode("<svg><script>alert(1)</script></svg>"), "");
  assert.equal(normalizeMfaQrCode('<svg><image href="https://example.com/x"/></svg>'), "");
  assert.equal(normalizeMfaQrCode("<!DOCTYPE svg><svg></svg>"), "");
  assert.equal(normalizeMfaQrCode("data:image/svg+xml;utf-8,%E0%A4%A"), "");
});
