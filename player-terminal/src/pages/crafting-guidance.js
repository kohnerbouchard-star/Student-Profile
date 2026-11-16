import { escapeHtml, formatNumber } from "../core/format.js";

// The read model's `owned` count is available stock after reservations, not total custody.
export function ingredientAvailability(item) {
  const count = (value) => (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value)))
    && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
  if (!count(item?.owned) || !count(item?.required) || Number(item.required) < 1) {
    return { known: false, enough: false, missing: null };
  }
  const missing = Math.max(0, Number(item.required) - Number(item.owned));
  return { known: true, enough: missing === 0, missing };
}

function requirementList(label, values) {
  const names = Array.isArray(values) ? values.filter((value) => typeof value === "string" && value.trim()) : [];
  return names.length ? `<p><strong>${label}:</strong> ${names.map(escapeHtml).join(", ")}</p>` : "";
}

export function renderCraftingGuidance(recipe) {
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const availability = ingredients.map(ingredientAvailability);
  const missing = availability.some((item) => item.known && !item.enough);
  const unknown = !Array.isArray(recipe.ingredients) || availability.some((item) => !item.known);
  const blockers = [
    recipe.enabled === false ? "This recipe is not currently available in your game or location." : "",
    recipe.unlockStatus !== "Unlocked" ? "This recipe is not unlocked. The current read does not specify how to unlock it." : "",
    missing ? "You need more available ingredients for one craft. Reserved items cannot be used." : "",
    unknown ? "Some ingredient quantities are unavailable. Refresh Crafting before starting a job." : "",
  ].filter(Boolean);
  const outputs = Array.isArray(recipe.outputs) ? recipe.outputs : [];
  const equipment = outputs.some((output) => output?.outputKind === "equipment");
  const stackable = outputs.some((output) => output?.outputKind === "stackable");
  return `<section aria-label="Recipe requirements">
    <h3>Before you craft</h3>
    ${blockers.length ? `<ul>${blockers.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}</ul>` : "<p>Ingredients are available for one craft.</p>"}
    <p>Amounts below are for one craft. Larger quantities require more ingredients. The server confirms whether the job can start.</p>
    ${recipe.requiredWorkshop ? `<p><strong>Required workshop:</strong> ${escapeHtml(recipe.requiredWorkshop)}</p>` : ""}
    ${requirementList("Required tools", recipe.requiredTools)}
    ${requirementList("Required entitlements", recipe.requiredEntitlements)}
    ${missing ? `<p>Check current offers for the missing materials. Availability and price are confirmed in each market.</p><div class="player-terminal-heading-actions"><button type="button" class="player-terminal-secondary-button" data-route="store">Browse Store</button><button type="button" class="player-terminal-secondary-button" data-route="marketplace">Browse Marketplace</button></div>` : ""}
    <h3>After production</h3>
    <p>Claim a completed job from the production queue to receive its output.</p>
    ${equipment ? "<p>Equipment appears in this workshop. Review its allowed slot before equipping it.</p>" : ""}
    ${stackable || !outputs.length ? "<p>Review the received items and their available actions in Inventory.</p>" : ""}
    <button type="button" class="player-terminal-secondary-button" data-route="inventory">Review Inventory</button>
  </section>`;
}

export function ingredientQuantityLabel(item) {
  const availability = ingredientAvailability(item);
  if (!availability.known) return "Available or required quantity unavailable";
  return `${formatNumber(item.owned)} available / ${formatNumber(item.required)} required${availability.missing ? ` · Need ${formatNumber(availability.missing)} more for one craft` : ""}`;
}
