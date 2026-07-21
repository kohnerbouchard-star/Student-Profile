import { escapeHtml, formatNumber } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderStatusPill } from "../components/ui.js";

function levelPercent(progression) {
  const start = Number(progression.currentLevelXp) || 0;
  const end = Number(progression.nextLevelXp) || start;
  const current = Number(progression.xp) || 0;
  if (progression.level >= 20 || end <= start) return 100;
  return Math.max(0, Math.min(100, Math.round(100 * (current - start) / (end - start))));
}

function reputationWidth(item) {
  const value = Number(item.displayScore ?? (Number(item.score) + 100));
  return Math.max(0, Math.min(200, value)) / 2;
}

export function renderProgressionPage(data, ui) {
  const progression = data.progression;
  const tab = ui.progressionTab || "Overview";
  const percent = levelPercent(progression);
  const completed = progression.achievements.filter((item) => item.complete).length;
  return `<section class="player-terminal-page player-terminal-progression-page">
    <div class="player-terminal-page-heading"><div><small>PLAYER DEVELOPMENT</small><h2>Progression</h2><p>Track bounded experience, recoverable reputation, practical access skills, and claimable achievements.</p></div><div class="player-terminal-heading-actions">${renderStatusPill(`LEVEL ${progression.level}`, "purple")}</div></div>

    <section class="player-terminal-progression-hero">
      <span class="player-terminal-level-orb">${escapeHtml(progression.level)}</span>
      <div><small>${escapeHtml(progression.title)}</small><h3>${escapeHtml(progression.playerName)}</h3><p>${escapeHtml(progression.summary)}</p><div class="player-terminal-xp-row"><div class="player-terminal-progress-track"><i style="width:${escapeHtml(percent)}%"></i></div><strong>${escapeHtml(formatNumber(progression.xp))} XP · ${escapeHtml(percent)}% to next level</strong></div></div>
      <dl><div><dt>SKILL POINTS</dt><dd>${escapeHtml(progression.skillPoints)}</dd></div><div><dt>ACTIVE ACCESS SKILLS</dt><dd>${escapeHtml(progression.licenses.length)}</dd></div><div><dt>ACHIEVEMENTS</dt><dd>${escapeHtml(completed)} / ${escapeHtml(progression.achievements.length)}</dd></div></dl>
    </section>

    <div class="player-terminal-progression-tabs">${["Overview","Skills","Achievements","Licenses"].map((item) => `<button class="${item === tab ? "active" : ""}" type="button" data-player-progression-tab="${item}">${item}</button>`).join("")}</div>

    ${tab === "Overview" ? `<div class="player-terminal-progression-grid">
      <section class="player-terminal-panel"><header class="player-terminal-panel-header"><div><span>REPUTATION</span><strong>Bounded from −100 to +100</strong></div></header><div class="player-terminal-reputation-list">${progression.reputation.map((item) => `<article><div><span>${icon(item.icon)}</span><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.label)}${item.public ? " · Public" : " · Private"}</small></div></div><div><strong>${escapeHtml(item.score > 0 ? `+${item.score}` : item.score)}</strong><div class="player-terminal-progress-track"><i style="width:${escapeHtml(reputationWidth(item))}%"></i></div></div></article>`).join("") || "<p>No reputation records yet.</p>"}</div></section>
      <section class="player-terminal-panel"><header class="player-terminal-panel-header"><div><span>NEXT MILESTONES</span><strong>Deterministic objectives</strong></div></header><div class="player-terminal-milestone-list">${progression.milestones.map((item) => `<article><span>${icon(item.icon)}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small><div class="player-terminal-progress-track"><i style="width:${escapeHtml(item.progress)}%"></i></div></div><em>${escapeHtml(item.progress)}%</em></article>`).join("") || "<p>No incomplete milestones.</p>"}</div></section>
    </div>` : ""}

    ${tab === "Skills" ? `<section class="player-terminal-panel player-terminal-skills-panel"><header class="player-terminal-panel-header"><div><span>SKILL MODULES</span><strong>${escapeHtml(progression.skillPoints)} points available</strong></div>${renderStatusPill("BALANCED TRACK CAPS", "amber")}</header><div>${progression.skills.map((skill) => {
      const blocked = skill.unlocked || skill.cost > progression.skillPoints || skill.minimumLevel > progression.level || (skill.prerequisiteSkillId && !progression.skills.some((item) => item.id === skill.prerequisiteSkillId && item.unlocked));
      return `<article class="${skill.unlocked ? "is-unlocked" : ""}"><span>${icon(skill.icon)}</span><div><small>${escapeHtml(skill.category)} · TIER ${escapeHtml(skill.tier)}</small><strong>${escapeHtml(skill.name)}</strong><p>${escapeHtml(skill.description)}</p><small>Level ${escapeHtml(skill.minimumLevel)} · Access capability only · No guaranteed economic return</small></div><div><strong>${escapeHtml(skill.cost)} PT</strong><button class="player-terminal-compact-button" type="button" data-player-skill-unlock="${escapeHtml(skill.id)}" ${blocked ? "disabled" : ""}>${skill.unlocked ? "Unlocked" : "Unlock"}</button></div></article>`;
    }).join("")}</div></section>` : ""}

    ${tab === "Achievements" ? `<section class="player-terminal-panel player-terminal-achievements-panel"><header class="player-terminal-panel-header"><div><span>ACHIEVEMENTS</span><strong>Completed and in progress</strong></div></header><div>${progression.achievements.map((item) => `<article class="${item.complete ? "is-complete" : ""}"><span>${icon(item.complete ? "trophy" : "lock")}</span><div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.description)}</p><small>${escapeHtml(item.progressText)}</small></div>${item.claimable && item.rewardId ? `<button class="player-terminal-compact-button" type="button" data-player-reward-claim="${escapeHtml(item.rewardId)}">Claim ${escapeHtml(item.rewardKind === "badge" ? "badge" : item.rewardAmount)}</button>` : renderStatusPill(item.complete ? "COMPLETE" : "IN PROGRESS", item.complete ? "green" : "cyan")}</article>`).join("")}</div></section>` : ""}

    ${tab === "Licenses" ? `<section class="player-terminal-panel player-terminal-licenses-panel"><header class="player-terminal-panel-header"><div><span>ACCESS SKILLS</span><strong>Practical tools, not pay-to-win multipliers</strong></div></header><div>${progression.licenses.map((item) => `<article><span>${icon(item.icon)}</span><div><small>${escapeHtml(item.issuer)}</small><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.description)}</p></div>${renderStatusPill(item.status, item.status === "Active" ? "green" : "amber")}</article>`).join("") || "<p>No skills unlocked yet.</p>"}</div></section>` : ""}
  </section>`;
}
