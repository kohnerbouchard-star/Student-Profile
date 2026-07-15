(function initContractReviewWiring() {
  "use strict";

  const PAGE = '[data-admin-terminal-page="Assignments"]';
  const state = { loading: false, rows: [], message: "", error: "", page: null };
  const text = (value) => String(value ?? "").trim();
  const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const array = (value) => Array.isArray(value) ? value : [];

  function gameId() {
    const model = window.Econovaria?.features?.adminOverviewTerminal?.currentModel || {};
    return text(
      model.activeGameId || model.selectedGameSessionId || model.gameSessionId ||
      model.gameId || model.activeGame?.id || model.game?.id ||
      sessionStorage.getItem("econovaria.admin.selected-game.v1")
    );
  }

  function path(suffix) {
    const id = gameId();
    if (!id) throw new Error("No active game is selected.");
    return `/api/admin/games/${encodeURIComponent(id)}${suffix}`;
  }

  async function json(response) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = object(payload.error);
      throw new Error(text(payload.message || error.message || payload.code || error.code) || `Request failed (${response.status}).`);
    }
    return payload;
  }

  function normalize(row) {
    const source = object(row);
    return {
      progressId: text(source.progressId || source.id),
      contractId: text(source.contractId || source.contract_id),
      contractTitle: text(source.contractTitle || source.contract_title) || "Contract",
      playerName: text(source.playerName || source.player_name || source.displayName) || "Player",
      rosterLabel: text(source.rosterLabel || source.roster_label),
      playerIdentifier: text(source.playerIdentifier || source.player_identifier),
      status: text(source.status).toLowerCase() || "available",
      evidence: object(source.evidencePayload || source.evidence_payload),
      result: object(source.resultPayload || source.result_payload),
      reward: object(source.rewardPayload || source.reward_payload),
      submittedAt: text(source.submittedAt || source.submitted_at) || null,
      rewardIssuedAt: text(source.rewardIssuedAt || source.reward_issued_at) || null,
      updatedAt: text(source.updatedAt || source.updated_at) || null,
    };
  }

  async function load(options = {}) {
    if (state.loading) return;
    state.loading = true;
    state.error = "";
    if (!options.keepMessage) state.message = "";
    render();
    try {
      const payload = await json(await fetch(path("/contract-submissions"), { headers: { Accept: "application/json" }, cache: "no-store" }));
      const root = object(payload);
      const data = object(root.data);
      const rows = [data.contractSubmissions, data.submissions, root.contractSubmissions, root.submissions, data.progress, root.progress].find(Array.isArray) || [];
      state.rows = rows.map(normalize).sort((a, b) => {
        const rank = { submitted: 0, in_progress: 1, completed: 2, failed: 3 };
        return (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || Date.parse(b.submittedAt || b.updatedAt || 0) - Date.parse(a.submittedAt || a.updatedAt || 0);
      });
    } catch (error) {
      state.error = text(error.message) || "Contract submissions could not be loaded.";
    } finally {
      state.loading = false;
      render();
    }
  }

  function panel() {
    const page = document.querySelector(PAGE);
    if (!page) return null;
    let node = page.querySelector("[data-admin-contract-review-panel]");
    if (!node) {
      node = document.createElement("section");
      node.className = "admin-contract-review-panel";
      node.dataset.adminContractReviewPanel = "";
      node.setAttribute("aria-label", "Contract submission review");
      (page.querySelector(".admin-terminal-contracts-workspace-v466") || page).insertAdjacentElement("afterend", node);
    }
    return node;
  }

  function render() {
    const root = panel();
    if (!root) return;
    root.replaceChildren();

    const head = document.createElement("header");
    head.className = "admin-contract-review-head";
    head.innerHTML = '<div><span>Submission Review</span><h3>Review student work</h3><p>Review evidence first. Reward payout is a separate confirmed action.</p></div>';
    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.textContent = state.loading ? "Loading…" : "Refresh";
    refresh.disabled = state.loading;
    refresh.addEventListener("click", () => void load());
    head.append(refresh);
    root.append(head);

    const summary = document.createElement("div");
    summary.className = "admin-contract-review-summary";
    for (const [label, count] of [
      ["Submitted", state.rows.filter((r) => r.status === "submitted").length],
      ["Approved", state.rows.filter((r) => r.status === "completed").length],
      ["Revision", state.rows.filter((r) => r.status === "in_progress").length],
      ["Rewarded", state.rows.filter((r) => r.rewardIssuedAt).length],
    ]) summary.append(summaryItem(label, count));
    root.append(summary);

    if (state.message) root.append(message(state.message, "success"));
    if (state.error) root.append(message(state.error, "error"));
    if (state.loading && !state.rows.length) return root.append(empty("Loading contract submissions…"));
    if (!state.rows.length) return root.append(empty("No contract submissions are available for review."));

    const list = document.createElement("div");
    list.className = "admin-contract-review-list";
    state.rows.forEach((row) => list.append(card(row)));
    root.append(list);
  }

  function card(row) {
    const article = document.createElement("article");
    article.className = "admin-contract-review-card";
    article.dataset.contractProgressId = row.progressId;
    article.dataset.contractId = row.contractId;

    const head = document.createElement("header");
    head.className = "admin-contract-review-card-head";
    const identity = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = row.contractTitle;
    const player = document.createElement("span");
    player.textContent = [row.playerName, row.rosterLabel, row.playerIdentifier].filter(Boolean).join(" · ");
    identity.append(title, player);
    head.append(identity, badge(row));
    article.append(head);

    const meta = document.createElement("div");
    meta.className = "admin-contract-review-meta";
    meta.append(metaItem("Submitted", date(row.submittedAt)), metaItem("Status", label(row.status)), metaItem("Reward", rewardText(row.reward)), metaItem("Payout", row.rewardIssuedAt ? date(row.rewardIssuedAt) : "Not issued"));
    article.append(meta, evidence(row.evidence));

    const feedback = document.createElement("label");
    feedback.className = "admin-contract-review-feedback";
    const caption = document.createElement("span");
    caption.textContent = "Teacher feedback";
    const textarea = document.createElement("textarea");
    textarea.rows = 3;
    textarea.placeholder = "Feedback shown to the player.";
    textarea.value = text(row.result.feedback || row.result.reviewFeedback || row.result.message);
    feedback.append(caption, textarea);
    article.append(feedback);

    const actions = document.createElement("div");
    actions.className = "admin-contract-review-actions";
    if (!row.rewardIssuedAt && ["submitted", "in_progress", "available"].includes(row.status)) {
      actions.append(reviewButton("Approve", "approve", row, textarea), reviewButton("Request revision", "request_revision", row, textarea), reviewButton("Reject", "reject", row, textarea));
    }
    if (row.status === "completed" && !row.rewardIssuedAt) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "admin-contract-review-reward";
      button.textContent = `Issue rewards · ${rewardText(row.reward)}`;
      button.addEventListener("click", () => void issue(row, button));
      actions.append(button);
    }
    if (row.rewardIssuedAt) {
      const issued = document.createElement("span");
      issued.className = "admin-contract-review-issued";
      issued.textContent = `Rewards issued ${date(row.rewardIssuedAt)}`;
      actions.append(issued);
    }
    article.append(actions);
    return article;
  }

  function evidence(value) {
    const data = object(value);
    const section = document.createElement("section");
    section.className = "admin-contract-review-evidence";
    const heading = document.createElement("h4");
    heading.textContent = "Submitted evidence";
    section.append(heading);
    const written = text(data.writtenResponse || data.response || data.text);
    if (written) section.append(evidenceBlock("Written response", written));
    const url = safeUrl(data.submissionUrl || data.url || data.link);
    if (url) {
      const block = document.createElement("div");
      block.className = "admin-contract-review-evidence-block";
      const span = document.createElement("span");
      span.textContent = "Submission link";
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Open submitted work";
      block.append(span, link);
      section.append(block);
    }
    const answers = array(data.answers);
    if (answers.length) {
      const block = document.createElement("div");
      block.className = "admin-contract-review-evidence-block";
      const span = document.createElement("span");
      span.textContent = "Quiz and form answers";
      const list = document.createElement("ol");
      answers.forEach((answer) => {
        const item = document.createElement("li");
        const strong = document.createElement("strong");
        strong.textContent = text(answer?.prompt) || "Question";
        const p = document.createElement("p");
        p.textContent = text(answer?.answer) || "No answer";
        item.append(strong, p);
        list.append(item);
      });
      block.append(span, list);
      section.append(block);
    }
    if (!written && !url && !answers.length) section.append(empty("No readable evidence was included."));
    return section;
  }

  function reviewButton(title, action, row, textarea) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `admin-contract-review-action admin-contract-review-action--${action}`;
    button.textContent = title;
    button.addEventListener("click", () => void review(row, action, text(textarea.value), button));
    return button;
  }

  async function review(row, action, feedback, button) {
    busy(button, true, "Saving…");
    try {
      await json(await fetch(path(`/contracts/${encodeURIComponent(row.contractId)}/progress/${encodeURIComponent(row.progressId)}/review`), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action, resultPayload: { feedback, reviewedFrom: "admin_contract_review" } }),
      }));
      state.message = action === "approve" ? `${row.playerName}'s submission was approved. Confirm rewards separately.` : action === "request_revision" ? `${row.playerName}'s submission was returned for revision.` : `${row.playerName}'s submission was rejected.`;
      await load({ keepMessage: true });
    } catch (error) {
      state.error = text(error.message) || "The review could not be saved.";
      render();
    } finally {
      if (button.isConnected) busy(button, false);
    }
  }

  async function issue(row, button) {
    if (!confirm(`Issue ${rewardText(row.reward)} to ${row.playerName}? This payout cannot be reversed.`)) return;
    busy(button, true, "Issuing…");
    try {
      const payload = await json(await fetch(path(`/contracts/${encodeURIComponent(row.contractId)}/progress/${encodeURIComponent(row.progressId)}/rewards/issue`), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: "{}",
      }));
      const data = object(payload.data);
      state.message = data.alreadyIssued || payload.alreadyIssued ? `Rewards for ${row.playerName} were already issued. No duplicate payout was created.` : `Rewards issued to ${row.playerName}.`;
      await load({ keepMessage: true });
    } catch (error) {
      state.error = text(error.message) || "Rewards could not be issued.";
      render();
    } finally {
      if (button.isConnected) busy(button, false);
    }
  }

  function busy(button, active, title = "") {
    const controls = button.closest(".admin-contract-review-card")?.querySelectorAll("button") || [];
    controls.forEach((node) => { node.disabled = active; });
    if (active) {
      button.dataset.label = button.textContent;
      button.textContent = title;
    } else if (button.dataset.label) {
      button.textContent = button.dataset.label;
      delete button.dataset.label;
    }
  }

  function badge(row) {
    const node = document.createElement("span");
    node.className = `admin-contract-review-status ${row.status === "completed" ? "good" : ["failed", "expired", "dismissed"].includes(row.status) ? "bad" : ["submitted", "in_progress"].includes(row.status) ? "warn" : ""}`;
    node.textContent = row.rewardIssuedAt ? "Rewarded" : label(row.status);
    return node;
  }

  function rewardText(value) {
    const reward = object(value);
    const cash = object(reward.cash);
    const parts = [];
    if (Number(cash.amount || 0) > 0) parts.push(`${text(cash.currencyCode) || "Cash"} ${Number(cash.amount).toLocaleString()}`);
    array(reward.items).forEach((item) => parts.push(`${Math.max(1, Number(item?.quantity || 1))}× ${text(item?.name || item?.itemName) || "item"}`));
    return parts.join(" + ") || "no listed reward";
  }

  function summaryItem(labelText, value) {
    const node = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = String(value);
    const span = document.createElement("span");
    span.textContent = labelText;
    node.append(strong, span);
    return node;
  }

  function metaItem(labelText, value) {
    const node = document.createElement("div");
    const span = document.createElement("span");
    span.textContent = labelText;
    const strong = document.createElement("strong");
    strong.textContent = text(value) || "—";
    node.append(span, strong);
    return node;
  }

  function evidenceBlock(labelText, value) {
    const node = document.createElement("div");
    node.className = "admin-contract-review-evidence-block";
    const span = document.createElement("span");
    span.textContent = labelText;
    const p = document.createElement("p");
    p.textContent = value;
    node.append(span, p);
    return node;
  }

  function message(value, tone) {
    const node = document.createElement("div");
    node.className = `admin-contract-review-message admin-contract-review-message--${tone}`;
    node.setAttribute("role", "status");
    node.textContent = value;
    return node;
  }

  function empty(value) {
    const node = document.createElement("p");
    node.className = "admin-contract-review-empty";
    node.textContent = value;
    return node;
  }

  function label(value) {
    return text(value).replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Available";
  }

  function date(value) {
    const parsed = new Date(value || 0);
    return value && !Number.isNaN(parsed.getTime()) ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(parsed) : "—";
  }

  function safeUrl(value) {
    try {
      const url = new URL(text(value), location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  function reconcile() {
    const page = document.querySelector(PAGE);
    if (!page) return;
    panel();
    if (state.page !== page) {
      state.page = page;
      void load();
    }
  }

  new MutationObserver(reconcile).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("click", (event) => {
    if (event.target.closest?.('[data-admin-section="Assignments"]')) setTimeout(reconcile, 0);
  });
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", reconcile, { once: true }) : reconcile();

  window.Econovaria = window.Econovaria || {};
  window.Econovaria.features = window.Econovaria.features || {};
  window.Econovaria.features.adminContractReview = { load, render, getRows: () => state.rows.slice() };
})();
