import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Vercel exposes explicit administrator MFA enrollment and verification routes", async () => {
  const [enroll, verify] = await Promise.all([
    read("api/admin-session/mfa/enroll.js"),
    read("api/admin-session/mfa/verify.js"),
  ]);

  for (const source of [enroll, verify]) {
    assert.match(source, /proxyAdminBff/);
    assert.match(source, /proxyAdmin:\s*false/);
    assert.doesNotMatch(source, /Authorization/);
    assert.doesNotMatch(source, /accessToken/);
  }

  assert.match(enroll, /path:\s*\["mfa",\s*"enroll"\]/);
  assert.match(verify, /path:\s*\["mfa",\s*"verify"\]/);
});
