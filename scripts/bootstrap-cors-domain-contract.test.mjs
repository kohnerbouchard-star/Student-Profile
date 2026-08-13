import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bootstrap = await readFile(
  new URL("../backend/supabase/functions/bootstrap-api/index.ts", import.meta.url),
  "utf8",
);
const edgeResponse = await readFile(
  new URL("../backend/src/platform/supabase/edgeResponse.ts", import.meta.url),
  "utf8",
);

test("bootstrap API uses the bounded production custom-domain allowlist", () => {
  assert.match(bootstrap, /ECONOVARIA_WEB_ALLOWED_ORIGINS/);
  assert.match(bootstrap, /ECONOVARIA_BROWSER_ORIGIN/);
  assert.match(bootstrap, /access-control-allow-origin/);
  assert.match(bootstrap, /origin_not_allowed/);
  assert.match(bootstrap, /ALLOWED_ORIGINS\.has\(origin\)/);
});

test("generic Edge response fallback is the canonical production domain", () => {
  assert.match(
    edgeResponse,
    /const PRODUCTION_BROWSER_ORIGIN = "https:\/\/econovaria\.com";/,
  );
  assert.doesNotMatch(
    edgeResponse,
    /const PRODUCTION_BROWSER_ORIGIN = "https:\/\/econovaria\.vercel\.app";/,
  );
});
