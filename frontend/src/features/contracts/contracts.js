(function initEconovariaPlayerContracts() {
  "use strict";

  window.Econovaria = window.Econovaria || {};
  window.Econovaria.features = window.Econovaria.features || {};
  window.Econovaria.features.contracts = window.Econovaria.features.contracts || {};

  const LOCKED_STATUSES = new Set(["completed", "expired", "failed", "dismissed"]);
  const SUBMITTED_STATUSES = new Set(["submitted", "in_review", "under_review"]);
  const CONTRACT_VIEW_ID = "contracts";

  function text(value) {
    return String(value ?? "").trim();
  }

  function object(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function array(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeUrl(value) {
    const candidate = text(value);
    if (!candidate) return "";

    try {
      const url = new URL(candidate, window.location.href);
      return ["https:", "http:"].includes(url.protocol) ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  function ensureContractState() {
    if (!state.contracts || typeof state.contracts !== "object") {
      state.contracts = { available: [], progress: [] };
    }
    if (!Array.isArray(state.contracts.available)) state.contracts.available = [];
    if (!Array.isArray(state.contracts.progress)) state.contracts.progress = [];
    return state.contracts;
  }

  function installViewContract() {
    for (const role of ["STUDENT", "READ_ONLY"]) {
      const views = PERMISSION_SETS?.[role]?.views;
      if (Array.isArray(views) && !views.includes(CONTRACT_VIEW_ID)) {
        const storeIndex = views.indexOf("store");
        views.splice(storeIndex >= 0 ? storeIndex : 1, 0, CONTRACT_VIEW_ID);
      }
    }

    VIEW_COPY[CONTRACT_VIEW_ID] = {
      title: "Contracts",
      subtitle: "Review assigned work, complete materials, and submit evidence for teacher review."
    };
  }

  function ensureContractsShell() {
    const nav = document.querySelector(".nav");
    let button = nav?.querySelector('[data-view="contracts"]');

    if (nav && !button) {
      button = document.createElement("button");
      button.className = "nav-item";
      button.dataset.view = CONTRACT_VIEW_ID;
      button.type = "button";
      button.textContent = "Contracts";
      const storeButton = nav.querySelector('[data-view="store"]');
      nav.insertBefore(button, storeButton || null);
      button.addEventListener("click", () => window.setTimeout(renderContracts, 0));
    }

    let section = document.getElementById(CONTRACT_VIEW_ID);
    if (!section) {
      section = document.createElement("section");
      section.id = CONTRACT_VIEW_ID;
      section.className = "view contracts-view";
      const profile = document.getElementById("profile");
      profile?.insertAdjacentElement("afterend", section);
    }

    return section;
  }

  function applyDashboardContracts(dashboard) {
    const contracts = object(object(dashboard).me).contracts;
    const source = object(contracts);
    const target = ensureContractState();
    target.available = array(source.available).map(normalizeContract);
    target.progress = array(source.progress).map(normalizeProgress);

    if (currentView?.() === CONTRACT_VIEW_ID) {
      renderContracts();
    }
  }

  function installDashboardSnapshotBridge() {
    const snapshotApi = window.Econovaria?.core?.snapshot;
    const original = snapshotApi?.mergeGameDashboardSnapshot;
    if (!snapshotApi || typeof original !== "function" || original.__contractsWrapped) return;

    function mergeGameDashboardWithContracts(dashboard) {
      const result = original.call(snapshotApi, dashboard);
      applyDashboardContracts(dashboard);
      return result;
    }

    mergeGameDashboardWithContracts.__contractsWrapped = true;
    snapshotApi.mergeGameDashboardSnapshot = mergeGameDashboardWithContracts;
  }

  function normalizeContract(contract) {
    const source = object(contract);
    return {
      ...source,
      contractId: text(source.contractId || source.id),
      title: text(source.title) || "Untitled contract",
      description: text(source.description),
      instructions: text(source.instructions),
      category: text(source.category) || "general",
      status: text(source.status) || "active",
      requirementsPayload: object(source.requirementsPayload),
      rewardPayload: object(source.rewardPayload),
      metadata: object(source.metadata),
      deadlineAt: text(source.deadlineAt) || null,
      publishedAt: text(source.publishedAt) || null,
      completionMode: text(source.completionMode) || "manual_review"
    };
  }

  function normalizeProgress(progress) {
    const source = object(progress);
    return {
      ...source,
      progressId: text(source.progressId || source.id),
      contractId: text(source.contractId),
      status: text(source.status) || "available",
      evidencePayload: object(source.evidencePayload),
      resultPayload: object(source.resultPayload),
      submittedAt: text(source.submittedAt) || null,
      completedAt: text(source.completedAt) || null,
      rewardIssuedAt: text(source.rewardIssuedAt) || null
    };
  }

  function progressFor(contractId) {
    return ensureContractState().progress.find((progress) => progress.contractId === contractId) || null;
  }

  function renderContracts() {
    const section = ensureContractsShell();
    if (!section) return;

    const contracts = ensureContractState();
    section.replaceChildren();

    const summary = document.createElement("div");
    summary.className = "grid cols-4 contracts-summary";
    const submitted = contracts.progress.filter((row) => SUBMITTED_STATUSES.has(text(row.status).toLowerCase())).length;
    const completed = contracts.progress.filter((row) => text(row.status).toLowerCase() === "completed").length;
    const rewarded = contracts.progress.filter((row) => Boolean(row.rewardIssuedAt)).length;
    summary.innerHTML = [
      metric("Available", contracts.available.length, "Contracts currently assigned", "Only active contracts available to your authenticated player are shown."),
      metric("Submitted", submitted, "Waiting for review", "Submitted work can be updated until it is completed or locked."),
      metric("Completed", completed, "Teacher-approved contracts", "Completed contracts cannot be submitted again."),
      metric("Rewards", rewarded, "Rewards already issued", "Cash and item rewards are issued by the teacher review workflow.")
    ].join("");
    section.append(summary);

    if (!contracts.available.length) {
      const empty = document.createElement("div");
      empty.className = "card contracts-empty";
      empty.innerHTML = '<h2 class="card-title">No active contracts</h2><p class="empty">No contracts are available for your player right now. Refresh after your teacher posts a new contract.</p>';
      section.append(empty);
      return;
    }

    const list = document.createElement("div");
    list.className = "contracts-list";
    contracts.available.forEach((contract) => list.append(renderContractCard(contract, progressFor(contract.contractId))));
    section.append(list);
  }

  function renderContractCard(contract, progress) {
    const article = document.createElement("article");
    article.className = "card contract-card";
    article.dataset.contractId = contract.contractId;

    const head = document.createElement("header");
    head.className = "contract-card-head";
    const heading = document.createElement("div");
    const eyebrow = document.createElement("div");
    eyebrow.className = "contract-eyebrow";
    eyebrow.textContent = contract.category;
    const title = document.createElement("h2");
    title.className = "card-title";
    title.textContent = contract.title;
    heading.append(eyebrow, title);
    head.append(heading, statusBadge(progress?.status || "available"));
    article.append(head);

    if (contract.description) article.append(paragraph(contract.description, "contract-description"));
    if (contract.instructions) {
      const instructions = document.createElement("section");
      instructions.className = "contract-instructions";
      instructions.append(subheading("Instructions"), paragraph(contract.instructions));
      article.append(instructions);
    }

    const meta = document.createElement("div");
    meta.className = "contract-meta-grid";
    meta.append(
      metaItem("Deadline", contract.deadlineAt ? formatDateTime(contract.deadlineAt) : "No deadline"),
      metaItem("Review", contract.completionMode === "auto_check" ? "Automatic check" : "Teacher review"),
      metaItem("Reward", rewardSummary(contract.rewardPayload)),
      metaItem("Difficulty", text(contract.metadata.difficulty) || "Standard")
    );
    article.append(meta);

    const materials = array(contract.metadata.materials);
    if (materials.length) article.append(renderMaterials(materials));

    const requirementText = text(contract.requirementsPayload.manualText);
    if (requirementText) {
      const requirement = document.createElement("div");
      requirement.className = "contract-requirement";
      requirement.append(subheading("Submission requirement"), paragraph(requirementText));
      article.append(requirement);
    }

    if (progress) article.append(renderProgress(progress));
    if (!progress || !LOCKED_STATUSES.has(text(progress.status).toLowerCase())) {
      article.append(renderEvidenceForm(contract, progress, materials));
    }

    return article;
  }

  function renderMaterials(materials) {
    const section = document.createElement("section");
    section.className = "contract-materials";
    section.append(subheading("Materials"));

    const list = document.createElement("div");
    list.className = "contract-material-list";
    materials.forEach((material, index) => {
      const source = object(material);
      const item = document.createElement("div");
      item.className = "contract-material";
      const title = document.createElement("strong");
      title.textContent = text(source.title) || `Material ${index + 1}`;
      const detail = document.createElement("span");
      detail.textContent = text(source.typeLabel || source.type) || "Resource";
      item.append(title, detail);

      const url = safeUrl(source.url || source.downloadUrl);
      if (url) {
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Open material";
        item.append(link);
      }
      list.append(item);
    });
    section.append(list);
    return section;
  }

  function renderProgress(progress) {
    const section = document.createElement("section");
    section.className = "contract-progress";
    section.append(subheading("Your submission"));

    const details = document.createElement("div");
    details.className = "contract-progress-grid";
    details.append(
      metaItem("Status", labelStatus(progress.status)),
      metaItem("Submitted", progress.submittedAt ? formatDateTime(progress.submittedAt) : "Not submitted"),
      metaItem("Completed", progress.completedAt ? formatDateTime(progress.completedAt) : "—"),
      metaItem("Reward", progress.rewardIssuedAt ? `Issued ${formatDateTime(progress.rewardIssuedAt)}` : "Not issued")
    );
    section.append(details);

    const feedback = text(
      progress.resultPayload.feedback ||
      progress.resultPayload.reviewFeedback ||
      progress.resultPayload.message
    );
    if (feedback) {
      const box = document.createElement("div");
      box.className = "contract-feedback";
      box.append(subheading("Teacher feedback"), paragraph(feedback));
      section.append(box);
    }
    return section;
  }

  function renderEvidenceForm(contract, progress, materials) {
    const form = document.createElement("form");
    form.className = "contract-evidence-form";
    form.dataset.contractSubmitForm = "";
    form.dataset.contractId = contract.contractId;

    const heading = subheading(progress ? "Update submission" : "Submit work");
    form.append(heading);

    const manualText = text(contract.requirementsPayload.manualText);
    if (manualText || !quizQuestions(materials).length) {
      const label = document.createElement("label");
      label.className = "contract-field";
      const caption = document.createElement("span");
      caption.textContent = "Written response";
      const textarea = document.createElement("textarea");
      textarea.name = "writtenResponse";
      textarea.rows = 5;
      textarea.placeholder = "Enter your response, explanation, or evidence here.";
      textarea.required = Boolean(manualText) || !quizQuestions(materials).length;
      textarea.value = text(progress?.evidencePayload?.writtenResponse);
      label.append(caption, textarea);
      form.append(label);
    }

    const fileRequirement = submissionRequirement(contract).type;
    if (["file", "upload", "attachment"].some((token) => fileRequirement.includes(token))) {
      const label = document.createElement("label");
      label.className = "contract-field";
      label.innerHTML = '<span>Submission link</span><small>Direct file upload is not enabled. Provide a shareable link to your work.</small>';
      const input = document.createElement("input");
      input.type = "url";
      input.name = "submissionUrl";
      input.placeholder = "https://...";
      input.required = true;
      input.value = text(progress?.evidencePayload?.submissionUrl);
      label.append(input);
      form.append(label);
    }

    quizQuestions(materials).forEach((entry) => form.append(renderQuestion(entry, progress)));

    const status = document.createElement("div");
    status.className = "contract-submit-status";
    status.dataset.contractSubmitStatus = "";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    form.append(status);

    const button = document.createElement("button");
    button.type = "submit";
    button.className = "primary-btn contract-submit-button";
    button.textContent = progress ? "Update submission" : "Submit contract";
    form.append(button);
    form.addEventListener("submit", handleContractSubmit);
    return form;
  }

  function renderQuestion(entry, progress) {
    const question = object(entry.question);
    const label = document.createElement("label");
    label.className = "contract-field contract-question";
    label.dataset.materialIndex = String(entry.materialIndex);
    label.dataset.questionIndex = String(entry.questionIndex);
    label.dataset.questionPrompt = text(question.prompt);
    label.dataset.questionType = text(question.questionType) || "short_answer";

    const caption = document.createElement("span");
    caption.textContent = `${entry.number}. ${text(question.prompt) || "Question"}`;
    label.append(caption);

    const previous = previousAnswer(progress, entry);
    const type = text(question.questionType).toLowerCase();
    const options = array(question.options).map(text).filter(Boolean);

    if (["paragraph", "long_answer", "essay"].includes(type)) {
      const textarea = document.createElement("textarea");
      textarea.rows = 4;
      textarea.name = `answer-${entry.materialIndex}-${entry.questionIndex}`;
      textarea.required = question.required !== false;
      textarea.value = text(previous);
      label.append(textarea);
      return label;
    }

    if (["multiple_choice", "single_choice", "dropdown"].includes(type) && options.length) {
      const select = document.createElement("select");
      select.name = `answer-${entry.materialIndex}-${entry.questionIndex}`;
      select.required = question.required !== false;
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "Select an answer";
      select.append(empty);
      options.forEach((optionText) => {
        const option = document.createElement("option");
        option.value = optionText;
        option.textContent = optionText;
        option.selected = optionText === text(previous);
        select.append(option);
      });
      label.append(select);
      return label;
    }

    const input = document.createElement("input");
    input.type = "text";
    input.name = `answer-${entry.materialIndex}-${entry.questionIndex}`;
    input.required = question.required !== false;
    input.value = text(previous);
    label.append(input);
    return label;
  }

  async function handleContractSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const contractId = text(form.dataset.contractId);
    const status = form.querySelector("[data-contract-submit-status]");
    const button = form.querySelector('button[type="submit"]');
    const evidencePayload = collectEvidence(form);

    if (!contractId || !currentSession?.token || !currentSession?.gameSessionId) {
      setSubmitStatus(status, "Your player session is missing. Sign in again.", "error");
      return;
    }

    button.disabled = true;
    button.textContent = "Submitting…";
    setSubmitStatus(status, "Submitting your work…", "neutral");

    try {
      const result = await submitPlayerContract(contractId, evidencePayload);
      if (!result?.ok || !result.progress) {
        throw new Error(result?.message || result?.error?.message || "Your contract could not be submitted.");
      }

      upsertProgress(normalizeProgress(result.progress));
      setSubmitStatus(status, "Submission saved. Refreshing contract status…", "success");

      if (typeof loadPlayerGameDashboardSnapshot === "function") {
        await loadPlayerGameDashboardSnapshot({
          gameSessionId: currentSession.gameSessionId,
          subscribe: false
        });
      }
      renderContracts();
      showGlobalStatus?.("ok", "Contract submission saved.");
    } catch (error) {
      setSubmitStatus(status, cleanErrorMessage(error.message || String(error)), "error");
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = progressFor(contractId) ? "Update submission" : "Submit contract";
      }
    }
  }

  function collectEvidence(form) {
    const formData = new FormData(form);
    const answers = [...form.querySelectorAll(".contract-question")].map((label) => {
      const control = label.querySelector("input, textarea, select");
      return {
        materialIndex: Number(label.dataset.materialIndex || 0),
        questionIndex: Number(label.dataset.questionIndex || 0),
        prompt: text(label.dataset.questionPrompt),
        questionType: text(label.dataset.questionType),
        answer: text(control?.value)
      };
    });

    return {
      version: 1,
      writtenResponse: text(formData.get("writtenResponse")),
      submissionUrl: text(formData.get("submissionUrl")),
      answers,
      submittedFrom: "student_contracts_view",
      clientSubmittedAt: new Date().toISOString()
    };
  }

  async function submitPlayerContract(contractId, evidencePayload) {
    const { publishableKey } = getSupabaseConfig();
    return callSupabaseJsonRoute(
      `/players/me/contracts/${encodeURIComponent(contractId)}/submit`,
      {
        method: "POST",
        token: publishableKey,
        playerSessionToken: currentSession.token,
        body: {
          gameSessionId: currentSession.gameSessionId,
          evidencePayload
        },
        fallbackCode: "player_contract_submit_failed",
        fallbackMessage: "Your contract could not be submitted."
      }
    );
  }

  function upsertProgress(progress) {
    const contracts = ensureContractState();
    const index = contracts.progress.findIndex((row) => row.contractId === progress.contractId);
    if (index >= 0) contracts.progress[index] = progress;
    else contracts.progress.unshift(progress);
  }

  function quizQuestions(materials) {
    const result = [];
    materials.forEach((material, materialIndex) => {
      array(object(material).questions).forEach((question, questionIndex) => {
        result.push({
          materialIndex,
          questionIndex,
          question: object(question),
          number: result.length + 1
        });
      });
    });
    return result;
  }

  function previousAnswer(progress, entry) {
    return array(progress?.evidencePayload?.answers).find((answer) =>
      Number(answer?.materialIndex) === entry.materialIndex &&
      Number(answer?.questionIndex) === entry.questionIndex
    )?.answer || "";
  }

  function submissionRequirement(contract) {
    const metadata = object(contract.metadata);
    const direct = object(metadata.submissionRequirement);
    if (Object.keys(direct).length) return { ...direct, type: text(direct.type).toLowerCase() };
    const requirement = array(metadata.submissionRequirements)[0] || {};
    return { ...object(requirement), type: text(requirement.type).toLowerCase() };
  }

  function rewardSummary(rewardPayload) {
    const payload = object(rewardPayload);
    const cash = object(payload.cash);
    const items = array(payload.items);
    const parts = [];
    const amount = Number(cash.amount || 0);
    if (amount > 0) parts.push(`${text(cash.currencyCode) || "Cash"} ${amount.toLocaleString()}`);
    items.forEach((item) => {
      const quantity = Math.max(1, Number(item?.quantity || 1));
      parts.push(`${quantity}× ${text(item?.name) || "item reward"}`);
    });
    return parts.join(" + ") || "No reward listed";
  }

  function statusBadge(status) {
    const value = text(status).toLowerCase() || "available";
    const badge = document.createElement("span");
    badge.className = `badge contract-status ${statusTone(value)}`.trim();
    badge.textContent = labelStatus(value);
    return badge;
  }

  function statusTone(status) {
    if (["completed", "approved"].includes(status)) return "good";
    if (["failed", "expired", "dismissed", "rejected"].includes(status)) return "bad";
    if (["submitted", "in_review", "under_review", "revision_requested"].includes(status)) return "warn";
    return "";
  }

  function labelStatus(status) {
    return text(status).replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()) || "Available";
  }

  function metaItem(label, value) {
    const item = document.createElement("div");
    item.className = "contract-meta-item";
    const caption = document.createElement("span");
    caption.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = text(value) || "—";
    item.append(caption, strong);
    return item;
  }

  function subheading(value) {
    const heading = document.createElement("h3");
    heading.className = "contract-subheading";
    heading.textContent = value;
    return heading;
  }

  function paragraph(value, className = "") {
    const node = document.createElement("p");
    if (className) node.className = className;
    node.textContent = text(value);
    return node;
  }

  function setSubmitStatus(node, message, tone) {
    if (!node) return;
    node.textContent = message;
    node.dataset.tone = tone;
  }

  installViewContract();
  ensureContractState();
  ensureContractsShell();
  installDashboardSnapshotBridge();

  Object.assign(window.Econovaria.features.contracts, {
    renderContracts,
    applyDashboardContracts,
    submitPlayerContract,
    collectEvidence,
    ensureContractsShell
  });
  window.renderContracts = renderContracts;
})();
