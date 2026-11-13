import { list, object, text, number, shortDate } from "./read-model-values.js";

function contractStatus(progress) {
  const status = text(progress?.status).toLowerCase();
  if (["completed", "approved", "rewarded"].includes(status)) return "Completed";
  if (status === "submitted") return "Submitted";
  if (["active", "accepted", "in_progress"].includes(status)) return "Active";
  return "Available";
}

function payloadList(value) {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
  const body = object(value);
  for (const key of ["items", "requirements", "submissionRequirements"]) {
    if (Array.isArray(body[key])) return body[key].map((item) => text(item)).filter(Boolean);
  }
  return [];
}

export function normalizeContracts(snapshot) {
  const contracts = object(object(snapshot.me).contracts);
  const progressByContract = new Map(list(contracts.progress).map((progress) => [progress.contractId, progress]));
  const items = list(contracts.available).map((contract) => {
    const progress = progressByContract.get(contract.contractId);
    const status = contractStatus(progress);
    const reward = object(contract.rewardPayload);
    const target = object(contract.targetingPayload);
    const metadata = object(contract.metadata);
    const countryCodes = list(target.countryCodes);
    const requirements = payloadList(contract.requirementsPayload);
    return {
      id: text(contract.contractId),
      status,
      title: text(contract.title, "Untitled contract"),
      issuer: text(metadata.issuer || contract.sourceType, "Econovaria"),
      location: countryCodes.length ? countryCodes.join(", ") : "All Nations",
      due: shortDate(contract.deadlineAt || contract.expiresAt),
      urgency: contract.deadlineAt ? "medium" : "low",
      rewardCash: number(reward.cashAmount ?? reward.amount ?? object(reward.cash).amount),
      rewardXp: number(reward.xp ?? reward.experience),
      progress: status === "Completed" || status === "Submitted" ? 100 : status === "Active" ? 25 : 0,
      objective: text(contract.description, text(contract.instructions)),
      requirements,
      submission: progress ? {
        time: shortDate(progress.submittedAt, "Submitted"),
        url: text(object(progress.evidencePayload).submissionUrl),
        note: text(object(progress.evidencePayload).note)
      } : null,
      timeline: [
        { label: "Available", time: text(contract.publishedAt) ? shortDate(contract.publishedAt) : "Available now", complete: true },
        { label: "Accepted", time: status === "Available" ? "Pending" : "Recorded", complete: status !== "Available" },
        { label: "Submitted for review", time: progress?.submittedAt ? shortDate(progress.submittedAt) : "Pending", complete: ["Submitted", "Completed"].includes(status) },
        { label: "Reward issued", time: progress?.rewardIssuedAt ? shortDate(progress.rewardIssuedAt) : "Pending", complete: status === "Completed" }
      ]
    };
  });
  return {
    tabs: ["Active", "Available", "Submitted", "Completed"],
    lifecycle: ["Available", "Active", "Submitted", "Completed"],
    items
  };
}
