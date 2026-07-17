import { escapeHtml, formatNumber } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderStatusPill } from "../components/ui.js";

export function renderProgressionPage(data, ui) {
  const progression = data.progression;
  const tab = ui.progressionTab || "Overview";
  const percent = Math.min(100, Math.round((progression.xp / progression.nextLevelXp) * 100));
  return `<section class="player-terminal-page player-terminal-progression-page">
    <div class="player-terminal-page-heading"><div><small>PLAYER DEVELOPMENT</small><h2>Progression</h2><p>Track level, practical licenses, reputation, and a limited set of skill upgrades.</p></div><div class="player-terminal-heading-actions">${renderStatusPill(`LEVEL ${progression.level}`, "purple")}</div></div>

    <section class="player-terminal-progression-hero">
      <span class="player-terminal-level-orb">${escapeHtml(progression.level)}</span>
      <div><small>${escapeHtml(progression.title)}</small><h3>${escapeHtml(progression.playerName)}</h3><p>${escapeHtml(progression.summary)}</p><div class="player-terminal-xp-row"><div class="player-terminal-progress-track"><i style="width:${escapeHtml(percent)}%"></i></div><strong>${escapeHtml(formatNumber(progression.xp))} / ${escapeHtml(formatNumber(progression.nextLevelXp))} XP</strong></div></div>
      <dl><div><dt>SKILL POINTS</dt><dd>${escapeHtml(progression.skillPoints)}</dd></div><div><dt>LICENSES</dt><dd>${escapeHtml(progression.licenses.length)}</dd></div><div><dt>ACHIEVEMENTS</dt><dd>${escapeHtml(progression.achievements.filter((item) => item.complete).length)} / ${escapeHtml(progression.achievements.length)}</dd></div></dl>
    </section>

    <div class="player-terminal-progression-tabs">${["Overview","Skills","Achievements","Licenses"].map((item) => `<button class="${item === tab ? "active" : ""}" type="button" data-player-progression-tab="${item}">${item}</button>`).join("")}</div>

    ${tab === "Overview" ? `<div class="player-terminal-progression-grid">
      <section class="player-terminal-panel"><header class="player-terminal-panel-header"><div><span>REPUTATION</span><strong>Performance by system</strong></div></header><div class="player-terminal-reputation-list">${progression.reputation.map((item) => `<article><div><span>${icon(item.icon)}</span><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.label)}</small></div></div><div><strong>${escapeHtml(item.score)}</strong><div class="player-terminal-progress-track"><i style="width:${escapeHtml(item.score)}%"></i></div></div></article>`).join("")}</div></section>
      <section class="player-terminal-panel"><header class="player-terminal-panel-header"><div><span>NEXT MILESTONES</span><strong>Near-term objectives</strong></div></header><div class="player-terminal-milestone-list">${progression.milestones.map((item) => `<article><span>${icon(item.icon)}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small><div class="player-terminal-progress-track"><i style="width:${escapeHtml(item.progress)}%"></i></div></div><em>${escapeHtml(item.progress)}%</em></article>`).join("")}</div></section>
    </div>` : ""}

    ${tab === "Skills" ? `<section class="player-terminal-panel player-terminal-skills-panel"><header class="player-terminal-panel-header"><div><span>SKILL MODULES</span><strong>${escapeHtml(progression.skillPoints)} points available</strong></div>${renderStatusPill("CONFIRMATION REQUIRED", "amber")}</header><div>${progression.skills.map((skill) => `<article class="${skill.unlocked ? "is-unlocked" : ""}"><span>${icon(skill.icon)}</span><div><small>${escapeHtml(skill.category)}</small><strong>${escapeHtml(skill.name)}</strong><p>${escapeHtml(skill.description)}</p></div><div><strong>${escapeHtml(skill.cost)} PT</strong><button class="player-terminal-compact-button" type="button" data-player-skill-unlock="${escapeHtml(skill.id)}" ${skill.unlocked || skill.cost > progression.skillPoints ? "disabled" : ""}>${skill.unlocked ? "Unlocked" : "Unlock"}</button></div></article>`).join("")}</div></section>` : ""}

    ${tab === "Achievements" ? `<section class="player-terminal-panel player-terminal-achievements-panel"><header class="player-terminal-panel-header"><div><span>ACHIEVEMENTS</span><strong>Completed and in progress</strong></div></header><div>${progression.achievements.map((item) => `<article class="${item.complete ? "is-complete" : ""}"><span>${icon(item.complete ? "trophy" : "lock")}</span><div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.description)}</p><small>${escapeHtml(item.progressText)}</small></div>${item.claimable ? `<button class="player-terminal-compact-button" type="button" data-player-reward-claim="${escapeHtml(item.id)}">Claim</button>` : renderStatusPill(item.complete ? "COMPLETE" : "IN PROGRESS", item.complete ? "green" : "cyan")}</article>`).join("")}</div></section>` : ""}

    ${tab === "Licenses" ? `<section class="player-terminal-panel player-terminal-licenses-panel"><header class="player-terminal-panel-header"><div><span>LICENSES & CERTIFICATIONS</span><strong>Access permissions</strong></div></header><div>${progression.licenses.map((item) => `<article><span>${icon(item.icon)}</span><div><small>${escapeHtml(item.issuer)}</small><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.description)}</p></div>${renderStatusPill(item.status, item.status === "Active" ? "green" : "amber")}</article>`).join("")}</div></section>` : ""}
  </section>`;
}
