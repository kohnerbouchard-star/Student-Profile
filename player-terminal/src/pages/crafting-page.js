import { escapeHtml, formatNumber } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderStatusPill } from "../components/ui.js";

function ingredientLine(item) {
  const enough = Number(item.owned) >= Number(item.required);
  return `<li class="${enough ? "is-ready" : "is-missing"}"><span>${icon(enough ? "check" : "close")}</span><div><strong>${escapeHtml(item.name || item.itemKey)}</strong><small>${escapeHtml(formatNumber(item.owned))} owned / ${escapeHtml(formatNumber(item.required))} required</small></div></li>`;
}

function media(item) {
  const src = String(item?.image || "").trim();
  return src
    ? `<img src="${escapeHtml(src)}" alt="" />`
    : icon("factory");
}

function queueJob(job) {
  const jobKey = escapeHtml(job.jobKey || job.id);
  const cancel = job.canCancel
    ? `<form data-player-form="craft-cancel" data-endpoint="craftCancel"><input type="hidden" name="jobKey" value="${jobKey}" /><button type="submit" class="player-terminal-secondary-button">Cancel</button></form>`
    : "";
  const claim = job.canClaim
    ? `<form data-player-form="craft-claim" data-endpoint="craftClaim"><input type="hidden" name="jobKey" value="${jobKey}" /><button type="submit" class="player-terminal-primary-button">Claim output</button></form>`
    : "";
  return `<article><span>${icon("clock")}</span><div><strong>${escapeHtml(job.name)}</strong><small>${escapeHtml(job.quantity)} units · ${escapeHtml(job.remaining || job.status)}</small></div><div class="player-terminal-progress-track"><i style="width:${escapeHtml(job.progress || 0)}%"></i></div><div class="player-terminal-heading-actions">${cancel}${claim}</div></article>`;
}

export function renderCraftingPage(data, ui) {
  const crafting = data.crafting;
  if (!Array.isArray(crafting?.recipes) || !crafting.recipes.length) {
    return `<section class="player-terminal-page player-terminal-crafting-page"><div class="player-terminal-page-heading"><div><small>FABRICATION WORKSHOP</small><h2>Crafting</h2><p>Combine owned materials into approved workshop items.</p></div></div>${renderEmptyState({ title: "No recipes available", detail: "Recipes will appear after an approved physical-economy pack is activated.", iconName: "factory" })}</section>`;
  }

  const selected = crafting.recipes.find((item) => item.id === ui.craftingRecipeId) || crafting.recipes[0];
  const craftable = selected.enabled !== false &&
    selected.ingredients.every((item) => Number(item.owned) >= Number(item.required)) &&
    selected.unlockStatus === "Unlocked";
  const effects = Array.isArray(crafting.effects) ? crafting.effects : [];
  const history = Array.isArray(crafting.effectHistory) ? crafting.effectHistory : [];
  const equipment = Array.isArray(crafting.equipment) ? crafting.equipment : [];

  return `<section class="player-terminal-page player-terminal-crafting-page">
    <div class="player-terminal-page-heading"><div><small>FABRICATION WORKSHOP</small><h2>Crafting</h2><p>Combine owned materials through authoritative, deterministic recipes.</p></div><div class="player-terminal-heading-actions">${renderStatusPill(`${crafting.workshopLevel} WORKSHOP`, "purple")}</div></div>

    <div class="player-terminal-crafting-summary">
      <article><span>${icon("factory")}</span><div><small>WORKSHOP LEVEL</small><strong>${escapeHtml(crafting.workshopLevel)}</strong><p>${escapeHtml(crafting.workshopNote)}</p></div></article>
      <article><span>${icon("inventory")}</span><div><small>MATERIAL SLOTS</small><strong>${escapeHtml(crafting.materialSlotsUsed)} / ${escapeHtml(crafting.materialSlotsMax)}</strong><p>Shared with player inventory</p></div></article>
      <article><span>${icon("clock")}</span><div><small>QUEUE STATUS</small><strong>${escapeHtml(crafting.queue.length)} active</strong><p>${crafting.queue.length ? escapeHtml(crafting.queue[0].remaining || crafting.queue[0].status) : "Workshop idle"}</p></div></article>
    </div>

    <div class="player-terminal-crafting-layout">
      <section class="player-terminal-panel player-terminal-recipe-list">
        <header class="player-terminal-panel-header"><div><span>RECIPES</span><strong>${escapeHtml(crafting.recipes.length)} available</strong></div></header>
        <div>${crafting.recipes.map((recipe) => `<button class="player-terminal-recipe-row${recipe.id === selected.id ? " active" : ""}" type="button" data-player-crafting-recipe="${escapeHtml(recipe.id)}"><span>${media(recipe)}</span><div><small>${escapeHtml(recipe.category)} · ${escapeHtml(recipe.duration)}</small><strong>${escapeHtml(recipe.name)}</strong><p>${escapeHtml(recipe.description)}</p></div>${renderStatusPill(recipe.unlockStatus, recipe.unlockStatus === "Unlocked" ? "green" : "amber")}</button>`).join("")}</div>
      </section>

      <section class="player-terminal-panel player-terminal-recipe-detail">
        <header class="player-terminal-panel-header"><div><span>RECIPE REVIEW</span><strong>${escapeHtml(selected.name)}</strong></div>${renderStatusPill(craftable ? "READY" : "BLOCKED", craftable ? "green" : "red")}</header>
        <div class="player-terminal-recipe-hero"><span>${media(selected)}</span><div><small>${escapeHtml(selected.category)} · ${escapeHtml(selected.duration)}</small><h3>${escapeHtml(selected.name)}</h3><p>${escapeHtml(selected.description)}</p></div></div>
        <div class="player-terminal-recipe-grid"><section><small>INGREDIENTS</small><ul>${selected.ingredients.map(ingredientLine).join("")}</ul></section><section><small>OUTPUT</small><article><span>${media(selected)}</span><div><strong>${escapeHtml(selected.outputQuantity)} × ${escapeHtml(selected.name)}</strong><small>${escapeHtml(selected.effect)}</small></div></article><dl><div><dt>CRAFT TIME</dt><dd>${escapeHtml(selected.duration)}</dd></div><div><dt>WORKSHOP</dt><dd>${escapeHtml(selected.requiredWorkshop)}</dd></div></dl></section></div>
        <form data-player-form="craft-item" data-endpoint="craftItem" data-recipe-id="${escapeHtml(selected.id)}"><label>QUANTITY<input name="quantity" type="number" min="1" max="${escapeHtml(selected.maxCraft)}" value="1" required /></label><button class="player-terminal-primary-button" type="submit" ${craftable ? "" : "disabled"}>${icon("factory")} Craft item</button></form>
      </section>

      <section class="player-terminal-panel player-terminal-crafting-queue">
        <header class="player-terminal-panel-header"><div><span>PRODUCTION QUEUE</span><strong>${escapeHtml(crafting.queue.length)} jobs</strong></div></header>
        <div>${crafting.queue.length ? crafting.queue.map(queueJob).join("") : `<p>No items are currently being fabricated.</p>`}</div>
      </section>

      <section class="player-terminal-panel">
        <header class="player-terminal-panel-header"><div><span>EQUIPMENT</span><strong>${escapeHtml(equipment.length)} items</strong></div></header>
        <div>${equipment.length ? equipment.map((item) => `<article><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.slot || "Not equipped")}</small></article>`).join("") : "<p>No crafted equipment is available.</p>"}</div>
      </section>

      <section class="player-terminal-panel">
        <header class="player-terminal-panel-header"><div><span>ACTIVE EFFECTS</span><strong>${escapeHtml(effects.length)} active</strong></div></header>
        <div>${effects.length ? effects.map((effect) => `<article><strong>${escapeHtml(effect.summary || effect.effectCode)}</strong><small>${escapeHtml(effect.status)} · ${escapeHtml(effect.stackCount)} stack(s)</small></article>`).join("") : "<p>No item effects are active.</p>"}</div>
      </section>

      <section class="player-terminal-panel">
        <header class="player-terminal-panel-header"><div><span>EFFECT HISTORY</span><strong>${escapeHtml(history.length)} records</strong></div></header>
        <div>${history.length ? history.slice(0, 20).map((entry) => `<article><strong>${escapeHtml(entry.summary || entry.effectCode)}</strong><small>${escapeHtml(entry.action)} · ${escapeHtml(entry.createdAt)}</small></article>`).join("") : "<p>No item effects have been recorded.</p>"}</div>
      </section>
    </div>
  </section>`;
}
