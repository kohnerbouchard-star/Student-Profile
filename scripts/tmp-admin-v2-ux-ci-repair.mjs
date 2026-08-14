import { readFile, writeFile } from "node:fs/promises";

async function replaceExact(path, oldValue, newValue, label) {
  const source = await readFile(path, "utf8");
  const count = source.split(oldValue).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one exact match, found ${count}`);
  await writeFile(path, source.replace(oldValue, newValue), "utf8");
}

const craftingPath = "admin/v2/src/routes/crafting/CraftingRoute.js";
let crafting = await readFile(craftingPath, "utf8");
const submitStart = crafting.indexOf('  form.addEventListener("submit", async (event) => {');
if (submitStart < 0) throw new Error("Crafting submit handler not found");
const blockStart = crafting.indexOf("    const proposed = {", submitStart);
const blockEndMarker = "\n  });\n\n  dialog.open(opener);";
const blockEnd = crafting.indexOf(blockEndMarker, blockStart);
if (blockStart < 0 || blockEnd < 0) throw new Error("Crafting malformed supply block anchors not found");
const craftingReplacement = `    const proposed = {
      countryCode: country || null,
      scarcityBand: scarcityBand.getValue(),
      availableQuantity: available,
      eventMultiplier: eventValue,
      routeMultiplier: routeValue,
      sourceEventKey: sourceEvent || null,
      expiresAt: expiry || null,
    };
    const before = item ? [
      \`Scarcity: \${titleCase(item.scarcityBand)}\`,
      \`Available: \${item.availableQuantity === null ? "unbounded" : displayNumber(item.availableQuantity)}\`,
      \`Event multiplier: \${displayDecimal(item.eventMultiplier)}\`,
      \`Route multiplier: \${displayDecimal(item.routeMultiplier)}\`,
      \`Expires: \${item.expiresAt ? displayDate(item.expiresAt) : "no expiry"}\`,
    ].join(" · ") : "No existing override";
    const after = [
      \`Scarcity: \${titleCase(proposed.scarcityBand)}\`,
      \`Available: \${proposed.availableQuantity === null ? "unbounded" : displayNumber(proposed.availableQuantity)}\`,
      \`Event multiplier: \${displayDecimal(proposed.eventMultiplier)}\`,
      \`Route multiplier: \${displayDecimal(proposed.routeMultiplier)}\`,
      \`Expires: \${proposed.expiresAt ? displayDate(proposed.expiresAt) : "no expiry"}\`,
    ].join(" · ");
    const review = AdminConfirmDialog({
      title: editing ? "Review supply change" : "Review supply override",
      message: \`Apply this \${country || "global"} supply state for \${key}?\`,
      detail: "This changes availability used by the physical economy. It does not change player-owned Inventory.",
      changes: [{ label: "Supply state", before, after }],
      confirmLabel: "Apply supply state",
      tone: "neutral",
      failureMessage: "The supply operation could not be committed.",
      async onConfirm() {
        const result = await onApplySupply(key, proposed);
        if (result?.ok !== true) throw new Error("CRAFTING_SUPPLY_FAILED");
        return true;
      },
    });
    const accepted = await review.open(submit);
    review.destroy();
    if (accepted) dialog.close("committed");`;
crafting = crafting.slice(0, blockStart) + craftingReplacement + crafting.slice(blockEnd);
await writeFile(craftingPath, crafting, "utf8");

const unitPath = "scripts/admin-v2-unit.test.mjs";
for (const [oldValue, newValue] of [
  ['["market", "Market"]', '["market", "Market Monitor"]'],
  ['["business", "Business"]', '["business", "Business Oversight"]'],
  ['["crafting", "Crafting"]', '["crafting", "Crafting Operations"]'],
  ['["news-events", "News & Events"]', '["news-events", "News & Event Monitor"]'],
  ['assert.equal(newsEvents.label, "News & Events");', 'assert.equal(newsEvents.label, "News & Event Monitor");'],
]) {
  await replaceExact(unitPath, oldValue, newValue, `navigation assertion ${oldValue}`);
}

await replaceExact(
  "scripts/admin-v2-loans-api.test.mjs",
  '  assert.match(route, /Authoritative lending portfolio/);\n  assert.match(route, /Internal ownership UUIDs/);',
  '  assert.match(route, /Loan authority boundary/);\n  assert.match(route, /Internal ownership and ledger identifiers are not exposed/);',
  "Loans authority assertions",
);

console.log("Admin V2 UX CI repair applied.");
