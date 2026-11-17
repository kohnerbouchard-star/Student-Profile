import { sha256Hex } from "../../../src/platform/supabase/edgeCrypto.ts";
import {
  object,
  readJson,
  optionalText,
  firstDefined,
  array,
  compactObject,
  slug,
} from "./mutationValues.ts";
import {
  normalizeTargeting,
  normalizeContractRewards,
} from "./storeMutationNormalization.ts";


export async function normalizeContractCreate(
  request: Request,
  deterministicKeySeed?: string,
): Promise<Record<string, any>> {
  const source = object(await readJson(request));
  const body = object(
    source.contract || source.assignment || source.payload || source,
  );
  const title = optionalText(body, ["title", "name"]) || "";
  const instructions =
    optionalText(body, ["instructions", "details", "taskInstructions"]) || "";
  const description = optionalText(body, ["description", "summary"]) ||
    instructions;
  const scheduledAt = optionalText(body, [
    "scheduledAt",
    "scheduleAt",
    "postAt",
    "publishAt",
  ]);
  const requestedStatus =
    (optionalText(body, ["status", "publishStatus"]) || "").toLowerCase();
  const postSetting = (optionalText(body, ["postSetting"]) || "").toLowerCase();
  const status =
    scheduledAt || postSetting === "scheduled" || body.isScheduled === true
      ? "scheduled"
      : postSetting === "draft" || body.isDraft === true
      ? "draft"
      : ["draft", "scheduled", "active"].includes(requestedStatus)
      ? requestedStatus
      : body.publishNow === true || postSetting === "now"
      ? "active"
      : "draft";
  const targetingPayload = normalizeTargeting(body);
  const explicitMetadata = object(body.metadata);
  const materials = firstDefined(body, ["materials", "attachments", "resources"]);
  const submissionRequirements = firstDefined(body, [
    "submissionRequirements", "studentWork", "requiredSubmissions",
  ]);
  // PATCH merges metadata with the stored contract. Omission must not become
  // an empty array; explicitly supplied arrays (including []) still replace it.
  const metadata = {
    ...(request.method === "POST" ? { materials: [], submissionRequirements: [] } : {}),
    ...explicitMetadata,
    ...(materials !== undefined ? { materials: array(materials) } : {}),
    ...(submissionRequirements !== undefined
      ? { submissionRequirements: array(submissionRequirements) }
      : {}),
  };
  const rewardPayload = normalizeContractRewards(body);
  const explicitRequirements = object(
    body.requirementsPayload || body.requirements,
  );
  const requirementsPayload = compactObject({
    ...explicitRequirements,
    manualText: explicitRequirements.manualText || instructions || undefined,
  });
  const suppliedKey = optionalText(body, ["contractKey", "key", "slug"]);
  const generatedSuffix = deterministicKeySeed
    ? (await sha256Hex(deterministicKeySeed)).slice(0, 12)
    : crypto.randomUUID().slice(0, 8);
  const generatedKey = `${slug(title) || "contract"}-${generatedSuffix}`;
  const visibility = optionalText(body, ["visibility"]) ||
    (targetingPayload.allPlayers === true ? "public" : "targeted");

  return compactObject({
    contractKey: suppliedKey ? slug(suppliedKey).slice(0, 64) : generatedKey,
    title,
    description,
    instructions,
    category: optionalText(body, ["category"]) || "general",
    status,
    visibility,
    targetingPayload,
    requirementsPayload,
    rewardPayload,
    completionMode: optionalText(body, ["completionMode"]) || "manual_review",
    publishedAt: scheduledAt || optionalText(body, ["publishedAt"]),
    deadlineAt: optionalText(body, [
      "deadlineAt",
      "deadline",
      "dueAt",
      "dueDate",
    ]),
    expiresAt: optionalText(body, ["expiresAt", "expirationAt"]),
    metadata,
  });
}


export async function normalizeContractReview(
  request: Request,
): Promise<Record<string, any>> {
  const source = object(await readJson(request));
  const body = object(source.review || source.payload || source);
  const rawAction = (optionalText(body, ["action", "decision", "status"]) || "")
    .toLowerCase();
  const actionMap: Record<string, string> = {
    approve: "approve",
    approved: "approve",
    complete: "approve",
    completed: "approve",
    accept: "approve",
    accepted: "approve",
    reject: "reject",
    rejected: "reject",
    fail: "reject",
    failed: "reject",
    request_revision: "request_revision",
    revision: "request_revision",
    revise: "request_revision",
    changes_requested: "request_revision",
  };
  const feedback = optionalText(body, [
    "feedback",
    "comment",
    "note",
    "message",
  ]);
  return {
    action: actionMap[rawAction] || rawAction,
    resultPayload: {
      ...object(body.resultPayload || body.result),
      ...(feedback ? { feedback } : {}),
    },
  };
}
export { normalizeStoreMutation } from "./storeMutationNormalization.ts";
export { normalizeSettingsMutation } from "./settingsMutationNormalization.ts";
export { applyDifficultyPolicy } from "./settingsMutationNormalization.ts";
