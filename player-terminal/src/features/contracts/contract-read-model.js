const PUBLIC_CONTRACT_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function publicContractKey(contract) {
  const value = text(contract.contractKey || contract.publicKey || contract.key);
  return PUBLIC_CONTRACT_KEY.test(value) ? value : "";
}

function internalContractId(contract) {
  return text(contract.contractId || contract.id);
}

function readableRequirement(value) {
  if (typeof value === "string") return value.trim();
  const item = object(value);
  return text(item.label || item.title || item.description || item.requirement || item.name);
}

function requirementList(value) {
  if (Array.isArray(value)) return value.map(readableRequirement).filter(Boolean);
  const body = object(value);
  for (const key of ["items", "requirements", "submissionRequirements", "steps"]) {
    if (Array.isArray(body[key])) return body[key].map(readableRequirement).filter(Boolean);
  }
  const single = readableRequirement(body);
  return single ? [single] : [];
}

function statusFrom(contract, progress, now) {
  const status = text(progress.status).toLowerCase();
  if (["rewarded", "completed"].includes(status) || progress.rewardIssuedAt) return "Completed";
  if (["approved"].includes(status)) return progress.rewardIssuedAt ? "Completed" : "Approved";
  if (["rejected", "denied"].includes(status)) return "Rejected";
  if (["revision_requested", "request_revision", "needs_revision"].includes(status)) return "Revision Required";
  if (["submitted", "under_review", "pending_review"].includes(status)) return "Submitted";
  if (["active", "accepted", "in_progress"].includes(status)) return "Active";

  const expiry = Date.parse(text(contract.expiresAt || contract.deadlineAt));
  if (Number.isFinite(expiry) && expiry <= now) return "Expired";
  if (text(contract.status).toLowerCase() === "scheduled") return "Scheduled";
  return "Available";
}

function shortDate(value, fallback = "No deadline") {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return fallback;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function urgency(contract, now) {
  const deadline = Date.parse(text(contract.deadlineAt || contract.expiresAt));
  if (!Number.isFinite(deadline)) return "low";
  const remaining = deadline - now;
  if (remaining <= 24 * 60 * 60 * 1000) return "high";
  if (remaining <= 72 * 60 * 60 * 1000) return "medium";
  return "low";
}

function reviewFeedback(progress) {
  const result = object(progress.resultPayload);
  return text(
    result.feedback ||
    result.reviewNote ||
    result.note ||
    result.message ||
    result.reason
  );
}

function locationLabel(targeting) {
  const target = object(targeting);
  const countries = list(target.countryCodes || target.locations || target.countries)
    .map((value) => text(value))
    .filter(Boolean);
  return countries.length ? countries.join(", ") : "All Nations";
}

function rewardFields(rewardPayload) {
  const reward = object(rewardPayload);
  const cash = object(reward.cash);
  const items = list(reward.items || reward.itemRewards);
  return {
    rewardCash: number(reward.cashAmount ?? reward.amount ?? cash.amount),
    rewardCurrencyCode: text(reward.currencyCode || cash.currencyCode),
    rewardXp: number(reward.xp ?? reward.experience),
    rewardItems: items.map((item) => ({
      id: text(object(item).itemId || object(item).id),
      name: text(object(item).name || object(item).itemName, "Item reward"),
      quantity: number(object(item).quantity, 1)
    }))
  };
}

function progressPercent(status) {
  if (["Completed", "Approved"].includes(status)) return 100;
  if (["Submitted", "Revision Required", "Rejected"].includes(status)) return 75;
  if (status === "Active") return 25;
  return 0;
}

function timeline(contract, progress, status) {
  const accepted = !["Available", "Scheduled", "Expired"].includes(status);
  const submitted = ["Submitted", "Revision Required", "Approved", "Rejected", "Completed"].includes(status);
  const reviewed = ["Revision Required", "Approved", "Rejected", "Completed"].includes(status);
  return [
    { label: "Available", time: contract.publishedAt ? shortDate(contract.publishedAt) : "Available", complete: true },
    { label: "Accepted", time: accepted ? shortDate(progress.createdAt, "Recorded") : "Pending", complete: accepted },
    { label: "Submitted for review", time: progress.submittedAt ? shortDate(progress.submittedAt) : "Pending", complete: submitted },
    { label: "Reviewed", time: reviewed ? shortDate(progress.updatedAt, "Reviewed") : "Pending", complete: reviewed },
    { label: "Reward issued", time: progress.rewardIssuedAt ? shortDate(progress.rewardIssuedAt) : "Pending", complete: Boolean(progress.rewardIssuedAt) }
  ];
}

export function normalizePlayerContracts(response, { now = Date.now() } = {}) {
  const body = object(response);
  const progressByContract = new Map(list(body.progress).map((entryValue) => {
    const entry = object(entryValue);
    return [text(entry.contractKey || entry.contractId), entry];
  }));
  const items = list(body.contracts).flatMap((contractValue) => {
    const contract = object(contractValue);
    const id = publicContractKey(contract);
    if (!id) return [];
    const progress = progressByContract.get(id) || progressByContract.get(internalContractId(contract)) || {};
    const status = statusFrom(contract, progress, now);
    const reward = rewardFields(contract.rewardPayload);
    const metadata = object(contract.metadata);
    const evidence = object(progress.evidencePayload);
    return [{
      id,
      status,
      backendStatus: text(progress.status || contract.status),
      title: text(contract.title, "Untitled contract"),
      issuer: text(metadata.issuer || contract.sourceType, "Econovaria"),
      category: text(contract.category, "General"),
      location: locationLabel(contract.targetingPayload),
      eligible: true,
      due: shortDate(contract.deadlineAt || contract.expiresAt),
      deadlineAt: text(contract.deadlineAt),
      expiresAt: text(contract.expiresAt),
      urgency: urgency(contract, now),
      ...reward,
      rewardIssued: Boolean(progress.rewardIssuedAt),
      progress: progressPercent(status),
      objective: text(contract.description, text(contract.instructions)),
      instructions: text(contract.instructions),
      requirements: requirementList(contract.requirementsPayload),
      completionMode: text(contract.completionMode),
      reviewFeedback: reviewFeedback(progress),
      submission: progress.submittedAt || Object.keys(evidence).length ? {
        time: shortDate(progress.submittedAt, "Submitted"),
        url: text(evidence.submissionUrl || evidence.url),
        note: text(evidence.note || evidence.response || evidence.text)
      } : null,
      timeline: timeline(contract, progress, status)
    }];
  });

  const preferredTabs = [
    "Active",
    "Available",
    "Submitted",
    "Revision Required",
    "Approved",
    "Completed",
    "Rejected",
    "Expired",
    "Scheduled"
  ];
  const present = new Set(items.map((item) => item.status));
  const tabs = preferredTabs.filter((status) => present.has(status) || ["Active", "Available", "Submitted", "Completed"].includes(status));

  return {
    tabs,
    lifecycle: ["Available", "Active", "Submitted", "Reviewed", "Completed"],
    items
  };
}
