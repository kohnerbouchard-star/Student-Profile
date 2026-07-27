import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const coreUrl = new URL("./marketplace-lifecycle-core.mjs", import.meta.url);
const source = await readFile(coreUrl, "utf8");
const headersNeedle = "const headers = request.headers();";
const headersReplacement = "const headers = await request.allHeaders();";
const cookieNeedle = 'await expect(page.evaluate(() => document.cookie)).resolves.not.toContain("econovaria_player_session");';
const cookieReplacement = 'expect(await page.evaluate(() => document.cookie)).not.toContain("econovaria_player_session");';

if (source.split(headersNeedle).length - 1 !== 1) {
  throw new Error("Marketplace browser adapter expected one request.headers() call.");
}
if (source.split(cookieNeedle).length - 1 !== 1) {
  throw new Error("Marketplace browser adapter expected one HttpOnly-cookie assertion.");
}

const materialized = source
  .replace(headersNeedle, headersReplacement)
  .replace(cookieNeedle, cookieReplacement);
const directory = await mkdtemp(join(dirname(fileURLToPath(coreUrl)), ".tmp-marketplace-browser-"));
const target = join(directory, "marketplace-lifecycle.spec.mjs");
try {
  await writeFile(target, materialized, "utf8");
  await import(pathToFileURL(target).href);
} finally {
  await rm(directory, { recursive: true, force: true });
}
