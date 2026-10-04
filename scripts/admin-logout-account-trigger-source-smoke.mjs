import { runInNewContext } from "node:vm";
import { strict as check } from "node:assert";
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

// Execute the actual classic scripts: preserve early-owner / bridge / later order.
const ownerSource = readFileSync("admin/logout-confirmation.js", "utf8");
class Element {
  constructor(attrs = {}, parent = null) { this.attrs = attrs; this.parent = parent; this.id = attrs.id || ""; this.textContent = attrs.text || ""; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  hasAttribute(name) { return name in this.attrs; }
  matches() { return this.hasAttribute("data-econovaria-admin-logout"); }
  closest(selector) {
    if (selector.includes("confirmation")) return this.attrs.inside ? this : null;
    return this.parent || this;
  }
}
class HTMLButtonElement extends Element {}
for (const mode of ["present", "older", "missing"]) {
  const listeners = [], opened = [];
  const window = { addEventListener(type, fn, capture) { listeners.push({ type, fn, capture }); } };
  const context = { window, Element, HTMLButtonElement };
  if (mode === "present") {
    runInNewContext(ownerSource, context);
    window.EconovariaAdminLogoutConfirmation = { ...window.EconovariaAdminLogoutConfirmation, open: (control) => opened.push(control) };
  } else if (mode === "older") window.EconovariaAdminLogoutConfirmation = { open: (control) => opened.push(control) };
  let delegated = 0;
  const installer = window.EconovariaAdminLogoutConfirmation?.installAccountTriggerBridge;
  if (installer) window.EconovariaAdminLogoutConfirmation.installAccountTriggerBridge = () => { delegated++; installer(); };
  const earlier = listeners.length;
  window.addEventListener("click", () => {}, true);
  runInNewContext(source, context);
  check.equal(delegated, installer ? 1 : 0);
  const owned = listeners.slice(earlier + 1);
  check.deepEqual(owned.map(({ type, capture }) => [type, capture]), [["click", true], ["keydown", true]]);
  check.equal(listeners.length, earlier + 3); // No early or double installation.
  const api = window.EconovariaAdminLogoutAccountTriggerBridge;
  check.equal(Object.isFrozen(api), true);
  const invoke = (type, target, key) => {
    let prevented = 0, stopped = 0; const before = opened.length;
    owned.find((entry) => entry.type === type).fn({ target, key, preventDefault() { prevented++; }, stopImmediatePropagation() { stopped++; } });
    return [opened.length - before, prevented, stopped];
  };
  for (const attribute of ["data-admin-terminal-action", "data-action", "id", "aria-label", "title", "text"]) {
    const control = new Element({ [attribute]: "account LOG_OUT now" });
    check.equal(api.isLogoutControl(control), true);
    check.deepEqual(invoke("click", new Element({}, control)), mode === "missing" ? [0, 0, 0] : [1, 1, 1]);
  }
  const control = new Element({ "data-econovaria-admin-logout": "" });
  for (const key of ["Enter", " "]) check.deepEqual(invoke("keydown", new Element({}, control), key), mode === "missing" ? [0, 0, 0] : [1, 1, 1]);
  check.deepEqual(invoke("keydown", new HTMLButtonElement({ text: "Logout" }), "Enter"), [0, 0, 0]);
  check.deepEqual(invoke("keydown", control, "Escape"), [0, 0, 0]);
  for (const target of [new Element({ text: "Logout", inside: true }), new Element({ text: "catalogout" }), null]) {
    check.equal(api.isLogoutControl(target), false);
    check.deepEqual(invoke("click", target), [0, 0, 0]);
  }
  // Lookup stays dynamic: an absent owner may arrive after the bridge.
  if (mode === "missing") {
    window.EconovariaAdminLogoutConfirmation = { open: (node) => opened.push(node) };
    check.deepEqual(invoke("click", control), [1, 1, 1]);
  }
  window.EconovariaAdminLogoutConfirmation = {};
  check.deepEqual(invoke("click", control), [0, 0, 0]);
}
console.log("Logout trigger owner, older-owner and missing-owner behavior/order passed.");
