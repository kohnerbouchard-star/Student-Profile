import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const coreUrl = new URL("./player-terminal-core.mjs", import.meta.url);
const source = await readFile(coreUrl, "utf8");
const needle = `  await expect(page.locator(".player-terminal-app-root")).toHaveAttribute("aria-hidden", "true");
  await page.keyboard.press("Escape");`;
const replacement = `  await expect(page.locator(".player-terminal-app-root")).toHaveAttribute("aria-hidden", "true");
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Escape");`;

if (source.split(needle).length - 1 !== 1) {
  throw new Error("Player Terminal browser adapter expected one country-modal Escape sequence.");
}

const materialized = source.replace(needle, replacement);
const target = fileURLToPath(new URL("./.generated-player-terminal.mjs", import.meta.url));
try {
  await writeFile(target, materialized, "utf8");
  await import(pathToFileURL(target).href);
} finally {
  await rm(target, { force: true });
}
