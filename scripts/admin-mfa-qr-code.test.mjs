import assert from "node:assert/strict";
import test from "node:test";

import {
  createCanonicalTotpEnrollment,
  readVerifiedTotpFactors,
} from "../backend/supabase/functions/staff-mfa-api/mfaEnrollmentLifecycle.ts";
import { normalizeMfaQrCode } from "../backend/supabase/functions/staff-mfa-api/mfaQrCode.ts";

function supabaseSvg(modules = 21) {
  const width = (modules + 8) * 3;
  const rectangles = [];
  for (let row = 0; row < modules; row += 1) {
    for (let column = 0; column < modules; column += 1) {
      const x = 12 + column * 3;
      const y = 12 + row * 3;
      const fill = (row + column) % 2 === 0 ? "black" : "white";
      rectangles.push(
        `<rect y="${y}" x="${x}" height="3" width="3" style="stroke:none; fill:${fill}" />`,
      );
    }
  }
  return `<?xml version="1.0"?>
<!-- Provider serialization is intentionally not part of the contract. -->
<svg xmlns:xlink="http://www.w3.org/1999/xlink" height="${width}" xmlns="http://www.w3.org/2000/svg" width="${width}">
${rectangles.join("\n")}
</svg>`;
}

function dataUrl(svg, variant = "raw") {
  if (variant === "base64") {
    return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
  }
  if (variant === "percent") {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  return `data:image/svg+xml;utf-8,${svg}`;
}

function decodeSvg(value) {
  const prefix = "data:image/svg+xml;base64,";
  assert.ok(value.startsWith(prefix));
  return Buffer.from(value.slice(prefix.length), "base64").toString("utf8");
}

test("normalizes semantic Supabase SVG data URLs into one inert browser contract", () => {
  const svg = supabaseSvg();
  for (const variant of ["raw", "percent", "base64"]) {
    const normalized = normalizeMfaQrCode(dataUrl(svg, variant));
    const compact = decodeSvg(normalized);
    assert.match(compact, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/u);
    assert.match(compact, /<path fill="#000" d="M/u);
    assert.doesNotMatch(compact, /<\?xml|<!--|xmlns:xlink|<script|<image|href=/iu);
    assert.ok(normalized.length < 200_000);
  }
});

test("compacts large provider SVG output below the browser transport bound", () => {
  const normalized = normalizeMfaQrCode(dataUrl(supabaseSvg(81)));
  assert.ok(normalized);
  assert.ok(normalized.length < 200_000);
});

test("rejects executable, externally referenced, or malformed SVG", () => {
  const svg = supabaseSvg();
  assert.equal(normalizeMfaQrCode(svg), "");
  assert.equal(normalizeMfaQrCode("data:image/png;base64,iVBORw0KGgo="), "");
  assert.equal(normalizeMfaQrCode(dataUrl(svg.replace("</svg>", "<script/></svg>"))), "");
  assert.equal(
    normalizeMfaQrCode(dataUrl(svg.replace("</svg>", '<image href="https://example.com/x"/></svg>'))),
    "",
  );
  assert.equal(normalizeMfaQrCode(dataUrl(svg.replace(/<rect[^>]+\/>\n/u, ""))), "");
});

test("status exposes only verified TOTP factors", () => {
  assert.deepEqual(
    readVerifiedTotpFactors({
      totp: [
        { id: "verified", status: "verified", factor_type: "totp" },
        { id: "pending", status: "unverified", factor_type: "totp" },
      ],
      phone: [{ id: "phone", status: "verified", factor_type: "phone" }],
    }).map((factor) => factor.id),
    ["verified"],
  );
});

test("enrollment removes the matching abandoned factor before creating a canonical replacement", async () => {
  const calls = [];
  const client = {
    auth: {
      mfa: {
        listFactors: async () => ({
          data: {
            totp: [{
              id: "stale",
              friendly_name: "Econovaria Admin",
              factor_type: "totp",
              status: "unverified",
            }],
          },
          error: null,
        }),
        unenroll: async ({ factorId }) => {
          calls.push(["unenroll", factorId]);
          return { error: null };
        },
        enroll: async ({ factorType, friendlyName }) => {
          calls.push(["enroll", factorType, friendlyName]);
          return {
            data: {
              id: "new-factor",
              totp: {
                qr_code: dataUrl(supabaseSvg()),
                secret: "JBSWY3DPEHPK3PXP",
                uri: "otpauth://totp/Econovaria:admin@example.test?secret=JBSWY3DPEHPK3PXP",
              },
            },
            error: null,
          };
        },
      },
    },
  };

  const result = await createCanonicalTotpEnrollment(client, "Econovaria Admin");
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    ["unenroll", "stale"],
    ["enroll", "totp", "Econovaria Admin"],
  ]);
  assert.match(result.qrCode, /^data:image\/svg\+xml;base64,/u);
});

test("invalid provider output is rolled back by exact factor id", async () => {
  const calls = [];
  const client = {
    auth: {
      mfa: {
        listFactors: async () => ({ data: { totp: [] }, error: null }),
        enroll: async () => ({
          data: {
            id: "bad-factor",
            totp: {
              qr_code: "not-a-data-url",
              secret: "JBSWY3DPEHPK3PXP",
              uri: "otpauth://totp/Econovaria:admin@example.test?secret=JBSWY3DPEHPK3PXP",
            },
          },
          error: null,
        }),
        unenroll: async ({ factorId }) => {
          calls.push(factorId);
          return { error: null };
        },
      },
    },
  };

  const result = await createCanonicalTotpEnrollment(client, "Econovaria Admin");
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid_mfa_enrollment_payload");
  assert.deepEqual(calls, ["bad-factor"]);
});
