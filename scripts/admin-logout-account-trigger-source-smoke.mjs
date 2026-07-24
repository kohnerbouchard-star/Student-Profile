import { readFileSync } from "node:fs";

const source = readFileSync("admin/logout-account-trigger-bridge.js", "utf8");
const bootstrap = readFileSync("admin/admin-bootstrap.js", "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(bootstrap.includes('"./logout-account-trigger-bridge.js"'), "Admin bootstrap does not load the real account logout trigger bridge.");
assert(
  bootstrap.indexOf('"./logout-account-trigger-bridge.js"') < bootstrap.indexOf('"./admin-logout-controller.js"'),
  "The account logout trigger bridge must load before the hardened logout controller.",
);
assert(source.includes("data-admin-terminal-action"), "Logout bridge does not inspect terminal action metadata.");
assert(source.includes("aria-label"), "Logout bridge does not inspect accessibility labels.");
assert(source.includes("textContent"), "Logout bridge does not inspect visible logout copy.");
assert(source.includes("stopImmediatePropagation"), "Logout bridge does not isolate legacy handlers.");
assert(source.includes("EconovariaAdminLogoutConfirmation"), "Logout bridge does not delegate to the owned confirmation surface.");
assert(!source.includes("window.fetch ="), "Logout bridge replaces the global fetch transport.");
assert(!source.includes("MutationObserver"), "Logout bridge adds a broad DOM observer.");
assert(!source.includes("innerHTML"), "Logout bridge owns presentation markup instead of delegating.");

console.log("Real account-menu logout trigger ownership passed.");
