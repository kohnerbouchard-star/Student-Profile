import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import {
  invalidStockroomResult,
  parseStockroomEnvelope,
  parseStockroomItems,
  parseStockroomLocations,
} from "../application/stockroom/businessStockroomResultParser.ts";
import { buildBusinessStockroomSnapshot } from "../application/stockroom/businessStockroomSnapshot.ts";
import {
  type BusinessEquipmentDto,
  type BusinessRecipeAccessDto,
  type BusinessStockroomSnapshotDto,
  PlayerBusinessError,
} from "../contracts/playerBusinessContracts.ts";

type Row = Record<string, unknown>;
type BusinessReadScope = {
  readonly gameSessionId: string;
  readonly playerId: string;
};

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu;
const PUBLIC_REFERENCE_KEY = /^[a-z]{3,8}_[0-9a-f]{32}$/u;

export async function readBusinessStockroom(
  client: EdgeSupabaseClient,
  input: BusinessReadScope,
): Promise<BusinessStockroomSnapshotDto> {
  const response = await client.rpc<unknown>(
    "read_owned_business_stockroom_snapshot_v2",
    {
      p_game_session_id: input.gameSessionId,
      p_player_id: input.playerId,
    },
  );
  if (response.error) {
    throw mapBusinessPhysicalEconomyReadError(
      response.error.message,
      "stockroom",
    );
  }

  const envelope = parseStockroomEnvelope(response.data);
  const snapshot = buildBusinessStockroomSnapshot(
    parseStockroomLocations(envelope.locations),
    parseStockroomItems(envelope.items),
  );
  if (snapshot.businessKey !== envelope.businessKey) {
    throw invalidStockroomResult(
      "Stockroom snapshot Business key does not match its holdings.",
    );
  }
  return snapshot;
}

export async function readBusinessRecipes(
  client: EdgeSupabaseClient,
  input: BusinessReadScope,
): Promise<readonly BusinessRecipeAccessDto[]> {
  const response = await client.rpc<unknown>("read_owned_business_recipes_v2", {
    p_game_session_id: input.gameSessionId,
    p_player_id: input.playerId,
  });
  if (response.error) {
    throw mapBusinessPhysicalEconomyReadError(response.error.message, "recipes");
  }
  return arrayRows(response.data).map((row) => ({
    accessKey: text(row.access_key),
    recipeKey: text(row.recipe_key),
    name: text(row.recipe_name, "Unnamed recipe"),
    category: text(row.recipe_category, "general"),
    tier: integer(row.recipe_tier, 1),
    workshopTier: integer(row.workshop_tier, 1),
    baseDurationSeconds: integer(row.base_duration_seconds, 1),
    difficultyProfile: text(row.difficulty_profile, "standard"),
    description: text(row.description, "Approved deterministic recipe."),
    availability: {
      enabled: Boolean(row.availability_enabled),
      availableInBusinessCountry: Boolean(row.available_in_business_country),
      availableNow: Boolean(row.available_now),
      scarcityBand: text(row.scarcity_band, "unavailable"),
      eventDurationMultiplier: number(row.event_duration_multiplier, 1),
      routeDisruptionMultiplier: number(row.route_disruption_multiplier, 1),
    },
    sourceType: text(row.source_type),
    grantedAt: text(row.granted_at),
  }));
}

export async function readBusinessEquipment(
  client: EdgeSupabaseClient,
  input: BusinessReadScope,
): Promise<readonly BusinessEquipmentDto[]> {
  const response = await client.rpc<unknown>("read_owned_business_equipment_v2", {
    p_game_session_id: input.gameSessionId,
    p_player_id: input.playerId,
  });
  if (response.error) {
    throw mapBusinessPhysicalEconomyReadError(response.error.message, "equipment");
  }

  const rows = arrayRowsStrict(response.data);
  const businessKeys = new Set<string>();
  const installationKeys = new Set<string>();
  const equipmentKeys = new Set<string>();
  return rows.map((row) => {
    const businessKey = publicKey(row.business_key, "biz");
    const installationKey = publicKey(row.installation_key, "bei");
    const equipmentKey = publicKey(row.equipment_key, "eqp");
    const itemKey = publicKey(row.item_key, "itm");
    const installationStatus = enumText(
      row.installation_status,
      ["installed", "offline"] as const,
    );
    const periodKey = text(row.period_key);
    const capacityMinutes = nonNegativeInteger(row.capacity_minutes);
    const reservedMinutes = nonNegativeInteger(row.reserved_minutes);
    const consumedMinutes = nonNegativeInteger(row.consumed_minutes);
    const availableMinutes = nonNegativeInteger(row.available_minutes);
    const idleMinutes = nonNegativeInteger(row.idle_minutes);
    const utilizationBasisPoints = boundedInteger(
      row.utilization_basis_points,
      0,
      10_000,
    );
    const installedEvidenceValid = installationStatus === "installed" &&
      reservedMinutes + consumedMinutes <= capacityMinutes &&
      availableMinutes === capacityMinutes - reservedMinutes - consumedMinutes &&
      idleMinutes === availableMinutes;
    const offlineEvidenceValid = installationStatus === "offline" &&
      capacityMinutes === 0 && reservedMinutes === 0 && availableMinutes === 0 &&
      idleMinutes === 0 && utilizationBasisPoints === 0;
    if (
      !/^equipment:[1-9][0-9]*$/u.test(periodKey) ||
      (!installedEvidenceValid && !offlineEvidenceValid) ||
      installationKeys.has(installationKey) ||
      equipmentKeys.has(equipmentKey)
    ) {
      throw invalidEquipmentResult();
    }
    if (businessKeys.size && !businessKeys.has(businessKey)) {
      throw invalidEquipmentResult();
    }
    businessKeys.add(businessKey);
    installationKeys.add(installationKey);
    equipmentKeys.add(equipmentKey);
    return {
      businessKey,
      installationKey,
      equipmentKey,
      itemKey,
      canonicalKey: canonicalKey(row.canonical_key),
      itemName: requiredText(row.item_name),
      equipmentSlot: requiredText(row.equipment_slot),
      capabilityKeys: stringArray(row.capability_keys),
      installationStatus,
      periodKey,
      capacityMinutes,
      reservedMinutes,
      consumedMinutes,
      availableMinutes,
      idleMinutes,
      utilizationBasisPoints,
      durabilitySupported: strictBoolean(row.durability_supported),
      repairSupported: strictBoolean(row.repair_supported),
    } satisfies BusinessEquipmentDto;
  });
}

export async function readBusinessWorkspaceProjection(
  client: EdgeSupabaseClient,
  input: BusinessReadScope,
): Promise<Record<string, unknown>> {
  const response = await client.rpc<unknown>(
    "read_owned_business_workspace_projection_v2",
    {
      p_game_session_id: input.gameSessionId,
      p_player_id: input.playerId,
    },
  );
  if (response.error) {
    throw mapBusinessPhysicalEconomyReadError(response.error.message, "workspace");
  }
  const projection = strictRow(response.data, invalidWorkspaceProjection);
  if (UUID.test(JSON.stringify(projection))) throw invalidWorkspaceProjection();
  validateWorkspaceGovernance(projection.governance);
  validateProductionReadiness(projection.productionReadiness);
  validateSalesOffers(projection.salesOffers);
  validateBusinessActivity(projection.activity);
  return projection;
}

function validateWorkspaceGovernance(value: unknown): void {
  const governance = strictRow(value, invalidWorkspaceProjection);
  publicKey(governance.businessKey, "biz");
  requiredText(governance.entityType);
  requiredText(governance.taxClassification);
  requiredText(governance.formationState);
  boundedInteger(governance.ownershipModelVersion, 1, 2);
  boundedInteger(governance.ownerCount, 1, 100_000);
  nonNegativeIntegerString(governance.totalUnits);
  nonNegativeIntegerString(governance.totalVotingUnits);
  if (governance.readOnly !== true) throw invalidWorkspaceProjection();
  const position = strictRow(governance.currentPosition, invalidWorkspaceProjection);
  publicKey(position.positionKey, "own");
  requiredText(position.ownershipKind);
  nonNegativeIntegerString(position.units);
  nonNegativeIntegerString(position.votingUnits);
  boundedInteger(position.ownershipBasisPoints, 0, 10_000);
  boundedInteger(position.votingBasisPoints, 0, 10_000);
  timestamp(position.effectiveAt);
  if (governance.corporateShareStructure !== null) {
    const structure = strictRow(
      governance.corporateShareStructure,
      invalidWorkspaceProjection,
    );
    for (const key of [
      "authorizedShares",
      "issuedShares",
      "treasuryShares",
      "outstandingShares",
    ]) nonNegativeIntegerString(structure[key]);
  }
  const proposals = strictArray(governance.openProposals);
  const keys = new Set<string>();
  for (const raw of proposals) {
    const proposal = strictRow(raw, invalidWorkspaceProjection);
    const proposalKey = publicKey(proposal.proposalKey, "bgp");
    if (keys.has(proposalKey)) throw invalidWorkspaceProjection();
    keys.add(proposalKey);
    requiredText(proposal.proposalType);
    enumText(proposal.status, ["open", "approved"] as const);
    boundedInteger(proposal.approvalThresholdBasisPoints, 1, 10_000);
    nonNegativeIntegerString(proposal.snapshotTotalVotingUnits);
    timestamp(proposal.expiresAt);
    optionalTimestamp(proposal.resolvedAt);
    optionalTimestamp(proposal.executedAt);
  }
}

function validateProductionReadiness(value: unknown): void {
  const entries = strictArray(value);
  const products = new Set<string>();
  for (const raw of entries) {
    const item = strictRow(raw, invalidWorkspaceProjection);
    publicKey(item.businessKey, "biz");
    const productKey = publicKey(item.productKey, "bpr");
    if (products.has(productKey)) throw invalidWorkspaceProjection();
    products.add(productKey);
    requiredText(item.productName);
    const status = enumText(
      item.status,
      ["ready", "blocked", "recipe_unavailable", "recipe_ambiguous"] as const,
    );
    if (item.recipeKey !== null) canonicalKey(item.recipeKey);
    if (status.startsWith("recipe_") && item.recipeKey !== null) {
      throw invalidWorkspaceProjection();
    }
    boundedInteger(item.plannedQuantity, 1, 10_000);
    strictBoolean(item.nextRunReady);
    strictBoolean(item.materialReady);
    strictBoolean(item.laborReady);
    strictBoolean(item.equipmentReady);
    for (const key of [
      "materialMaxUnits",
      "laborMaxUnits",
      "equipmentMaxUnits",
      "maxRunnableUnits",
      "materialLines",
      "materialBlockedLines",
      "laborRequiredMinutes",
      "laborAvailableMinutes",
      "laborRequiredHeadcount",
      "laborAvailableHeadcount",
      "equipmentRequiredMinutes",
      "equipmentAvailableMinutes",
      "equipmentRequiredInstances",
      "equipmentAvailableInstances",
    ]) nonNegativeInteger(item[key]);
    nonNegativeNumber(item.materialRequired);
    nonNegativeNumber(item.materialAvailable);
    const bottlenecks = strictArray(item.bottlenecks).map((entry) =>
      enumText(entry, ["recipe", "material", "labor", "equipment"] as const)
    );
    if (new Set(bottlenecks).size !== bottlenecks.length) {
      throw invalidWorkspaceProjection();
    }
    const payrollPeriodKey = requiredText(item.payrollPeriodKey);
    const equipmentPeriodKey = requiredText(item.equipmentPeriodKey);
    if (
      !/^payroll:[1-9][0-9]*$/u.test(payrollPeriodKey) ||
      !/^equipment:[1-9][0-9]*$/u.test(equipmentPeriodKey)
    ) throw invalidWorkspaceProjection();
    if (
      item.maxRunnableUnits !== Math.min(
        Number(item.materialMaxUnits),
        Number(item.laborMaxUnits),
        Number(item.equipmentMaxUnits),
      ) ||
      item.nextRunReady !==
        (Number(item.maxRunnableUnits) >= Number(item.plannedQuantity)) ||
      item.materialReady !==
        (Number(item.materialMaxUnits) >= Number(item.plannedQuantity)) ||
      item.laborReady !==
        (Number(item.laborMaxUnits) >= Number(item.plannedQuantity)) ||
      item.equipmentReady !==
        (Number(item.equipmentMaxUnits) >= Number(item.plannedQuantity))
    ) throw invalidWorkspaceProjection();
  }
}

function validateSalesOffers(value: unknown): void {
  const entries = strictArray(value);
  const offers = new Set<string>();
  for (const raw of entries) {
    const offer = strictRow(raw, invalidWorkspaceProjection);
    const offerKey = publicKey(offer.offerKey, "sof");
    if (offers.has(offerKey)) throw invalidWorkspaceProjection();
    offers.add(offerKey);
    publicKey(offer.itemKey, "itm");
    canonicalKey(offer.canonicalKey);
    requiredText(offer.itemName);
    const status = enumText(
      offer.status,
      ["draft", "active", "paused", "withdrawal_pending"] as const,
    );
    nonNegativeNumber(offer.unitPrice);
    const currency = requiredText(offer.currencyCode);
    if (!/^[A-Z0-9_]{3,16}$/u.test(currency)) throw invalidWorkspaceProjection();
    const owned = nonNegativeInteger(offer.quantityOwned);
    const reserved = nonNegativeInteger(offer.quantityReserved);
    const available = nonNegativeInteger(offer.quantityAvailable);
    if (reserved > owned || available !== Math.max(owned - reserved, 0)) {
      throw invalidWorkspaceProjection();
    }
    const purchaseAllowed = strictBoolean(offer.purchaseAllowed);
    if (purchaseAllowed !== (status === "active")) throw invalidWorkspaceProjection();
    if (status === "withdrawal_pending") {
      const withdrawal = strictRow(offer.withdrawal, invalidWorkspaceProjection);
      publicKey(withdrawal.requestKey, "swr");
      enumText(withdrawal.mode, ["full", "reduce"] as const);
      if (withdrawal.requestedQuantity !== null) {
        boundedInteger(withdrawal.requestedQuantity, 1, Number.MAX_SAFE_INTEGER);
      }
      enumText(withdrawal.resumeStatus, ["draft", "active", "paused"] as const);
      timestamp(withdrawal.requestedAt);
      timestamp(withdrawal.effectiveAt);
      optionalTimestamp(withdrawal.nextAttemptAt);
      optionalTimestamp(withdrawal.lastAttemptAt);
      if (
        withdrawal.lastBlockReason !== null &&
        withdrawal.lastBlockReason !== "inventory_reserved"
      ) throw invalidWorkspaceProjection();
      nonNegativeInteger(withdrawal.attemptCount);
    } else if (offer.withdrawal !== null) {
      throw invalidWorkspaceProjection();
    }
    boundedInteger(offer.version, 1, Number.MAX_SAFE_INTEGER);
  }
}

function validateBusinessActivity(value: unknown): void {
  const entries = strictArray(value);
  const keys = new Set<string>();
  for (const raw of entries) {
    const activity = strictRow(raw, invalidWorkspaceProjection);
    const key = publicKey(activity.activityKey, "bae");
    if (keys.has(key)) throw invalidWorkspaceProjection();
    keys.add(key);
    requiredText(activity.eventType);
    requiredText(activity.reasonCode);
    enumText(activity.actorType, ["player", "staff_user", "system"] as const);
    if (
      activity.referenceKey !== null &&
      !PUBLIC_REFERENCE_KEY.test(requiredText(activity.referenceKey))
    ) throw invalidWorkspaceProjection();
    timestamp(activity.occurredAt);
  }
}

function mapBusinessPhysicalEconomyReadError(
  message: string,
  resource: "stockroom" | "recipes" | "equipment" | "workspace",
): PlayerBusinessError {
  const code = message.trim().split(/\s+/u)[0] ||
    "BUSINESS_PHYSICAL_ECONOMY_READ_FAILED";
  const mappings: Record<string, [number, string]> = {
    PLAYER_REQUIRED: [401, "Player session scope is required."],
    BUSINESS_NOT_FOUND: [404, "Business was not found for this player."],
    BUSINESS_OWNERSHIP_REQUIRED: [404, "Business ownership was not found for this player."],
    BUSINESS_OWNERSHIP_AMBIGUOUS: [
      409,
      "Multiple active Business ownership positions require resolution.",
    ],
    BUSINESS_STOCKROOM_LOCATIONS_INCOMPLETE: [
      500,
      "Canonical Business Stockroom locations are incomplete.",
    ],
  };
  const mapped = mappings[code];
  const resourceMessage = resource === "stockroom"
    ? "The Business Stockroom could not be loaded."
    : resource === "recipes"
    ? "Business recipes could not be loaded."
    : resource === "equipment"
    ? "Business equipment could not be loaded."
    : "The Business operating workspace could not be loaded.";
  return new PlayerBusinessError(
    code.toLowerCase(),
    mapped?.[1] ?? resourceMessage,
    mapped?.[0] ?? 400,
  );
}

function invalidEquipmentResult(): PlayerBusinessError {
  return new PlayerBusinessError(
    "business_equipment_result_invalid",
    "Business equipment returned invalid public evidence.",
    500,
  );
}

function invalidWorkspaceProjection(): PlayerBusinessError {
  return new PlayerBusinessError(
    "business_workspace_projection_invalid",
    "The Business operating workspace returned invalid public evidence.",
    500,
  );
}

function arrayRows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter(isRow) : [];
}

function arrayRowsStrict(value: unknown): Row[] {
  if (!Array.isArray(value) || value.some((entry) => !isRow(entry))) {
    throw invalidEquipmentResult();
  }
  return value;
}

function strictArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw invalidWorkspaceProjection();
  return value;
}

function strictRow(
  value: unknown,
  invalid: () => PlayerBusinessError,
): Row {
  if (!isRow(value)) throw invalid();
  return value;
}

function isRow(value: unknown): value is Row {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown, defaultValue = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : defaultValue;
}

function requiredText(value: unknown): string {
  const result = text(value);
  if (!result || UUID.test(result)) throw invalidEquipmentResult();
  return result;
}

function publicKey(value: unknown, prefix: string): string {
  const result = text(value).toLowerCase();
  if (!new RegExp(`^${prefix}_[0-9a-f]{32}$`, "u").test(result)) {
    throw invalidWorkspaceProjection();
  }
  return result;
}

function canonicalKey(value: unknown): string {
  const result = text(value);
  if (!/^[a-z0-9][a-z0-9._:-]{0,159}$/u.test(result)) {
    throw invalidWorkspaceProjection();
  }
  return result;
}

function strictBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw invalidWorkspaceProjection();
  return value;
}

function enumText<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] {
  const result = text(value).toLowerCase();
  if (!allowed.includes(result)) throw invalidWorkspaceProjection();
  return result as T[number];
}

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw invalidEquipmentResult();
  const result = value.map((entry) => requiredText(entry));
  if (new Set(result).size !== result.length) throw invalidEquipmentResult();
  return result;
}

function number(value: unknown, defaultValue = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function integer(value: unknown, defaultValue = 0): number {
  return Math.trunc(number(value, defaultValue));
}

function nonNegativeInteger(value: unknown): number {
  return boundedInteger(value, 0, Number.MAX_SAFE_INTEGER);
}

function nonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw invalidWorkspaceProjection();
  return parsed;
}

function nonNegativeIntegerString(value: unknown): string {
  const result = text(value);
  if (!/^(0|[1-9][0-9]*)$/u.test(result)) throw invalidWorkspaceProjection();
  return result;
}

function timestamp(value: unknown): string {
  const result = text(value);
  if (!result || !Number.isFinite(Date.parse(result))) throw invalidWorkspaceProjection();
  return result;
}

function optionalTimestamp(value: unknown): string | null {
  if (value === null) return null;
  return timestamp(value);
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw invalidWorkspaceProjection();
  }
  return parsed;
}
