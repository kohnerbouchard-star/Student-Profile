import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const coreUrl = new URL("./marketplace-lifecycle-core.mjs", import.meta.url);
const source = await readFile(coreUrl, "utf8");
const headersNeedle = "const headers = request.headers();";
const headersReplacement = "const headers = await request.allHeaders();";
const routeCookieNeedle = 'expect(headers.cookie).toContain("econovaria_player_session=");';
const routeCookieReplacement = 'expect((await page.context().cookies()).some((cookie) => cookie.name === "econovaria_player_session" && cookie.httpOnly)).toBe(true);';
const documentCookieNeedle = 'await expect(page.evaluate(() => document.cookie)).resolves.not.toContain("econovaria_player_session");';
const documentCookieReplacement = 'expect(await page.evaluate(() => document.cookie)).not.toContain("econovaria_player_session");';

for (const [needle, label] of [
  [headersNeedle, "request.headers() call"],
  [routeCookieNeedle, "route cookie assertion"],
  [documentCookieNeedle, "document cookie assertion"],
]) {
  if (source.split(needle).length - 1 !== 1) {
    throw new Error(`Marketplace browser adapter expected one ${label}.`);
  }
}

const materialized = source
  .replace(headersNeedle, headersReplacement)
  .replace(routeCookieNeedle, routeCookieReplacement)
  .replace(documentCookieNeedle, documentCookieReplacement);
const target = fileURLToPath(new URL("./.generated-marketplace-lifecycle.mjs", import.meta.url));
try {
  await writeFile(target, materialized, "utf8");
  await import(pathToFileURL(target).href);
} finally {
  await rm(target, { force: true });
}
