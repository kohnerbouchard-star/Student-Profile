import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const files = {
  loader: await readFile(new URL("../admin/crafting-oversight-loader.js", import.meta.url), "utf8"),
  client: await readFile(new URL("../admin/crafting-oversight-client.js", import.meta.url), "utf8"),
  surface: await readFile(new URL("../admin/crafting-oversight-surface.js", import.meta.url), "utf8"),
  css: await readFile(new URL("../admin/css/crafting-oversight.css", import.meta.url), "utf8"),
  host: await readFile(new URL("../admin/inventory-redemption-queue-loader.js", import.meta.url), "utf8"),
};
assert.match(files.host, /crafting-oversight-loader/);
assert.match(files.surface, /setAttribute\(\"role\", \"dialog\"\)/);
assert.match(files.surface, /aria-live=\"polite\"/);
assert.match(files.surface, /release_and_fail/);
assert.match(files.surface, /requeue/);
assert.doesNotMatch(files.surface, /MutationObserver/);
assert.match(files.client, /crafting\$\{suffix\}/);
assert.match(files.client, /path\(gameId, \"\/oversight\"\)/);
assert.match(files.client, /\/recover/);
assert.match(files.client, /\/supply/);
assert.match(files.css, /@media\(max-width:600px\)/);
console.log("Admin Crafting oversight contract passed.");
