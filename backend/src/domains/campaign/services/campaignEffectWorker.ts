import type { CampaignEffectDefinition } from "../contracts/campaignRuntimeContracts.ts";
import { CampaignRuntimeError } from "../contracts/campaignRuntimeContracts.ts";

export interface ClaimedCampaignEffectCommand {
  readonly commandId: string;
  readonly gameId: string;
  readonly campaignId: string;
  readonly idempotencyKey: string;
  readonly effectKind: CampaignEffectDefinition["kind"];
  readonly payload: unknown;
  readonly attemptCount: number;
}

export interface CampaignEffectWorkerRepository {
  claim(input: {
    readonly limit: number;
    readonly claimedAt: string;
  }): Promise<readonly ClaimedCampaignEffectCommand[]>;
  complete(input: {
    readonly commandId: string;
    readonly completedAt: string;
  }): Promise<void>;
  fail(input: {
    readonly commandId: string;
    readonly errorCode: string;
  }): Promise<void>;
}

export interface CampaignEffectPorts {
  publishNews(input: PurposeBuiltCommand<"publish_news">): Promise<void>;
  createContract(input: PurposeBuiltCommand<"create_contract">): Promise<void>;
  notifyPlayers(input: PurposeBuiltCommand<"notify_players">): Promise<void>;
  applyMarketShock(input: PurposeBuiltCommand<"apply_market_shock">): Promise<void>;
  setStoreScarcity(input: PurposeBuiltCommand<"set_store_scarcity">): Promise<void>;
  setRouteState(input: PurposeBuiltCommand<"set_route_state">): Promise<void>;
}

export interface PurposeBuiltCommand<
  TKind extends CampaignEffectDefinition["kind"],
> {
  readonly commandId: string;
  readonly gameId: string;
  readonly campaignId: string;
  readonly idempotencyKey: string;
  readonly effect: Extract<CampaignEffectDefinition, { kind: TKind }>;
}

export interface CampaignEffectWorkerResult {
  readonly claimedCount: number;
  readonly completedCount: number;
  readonly failedCount: number;
  readonly failures: readonly {
    readonly commandId: string;
    readonly errorCode: string;
  }[];
}

export async function runCampaignEffectWorker(input: {
  readonly repository: CampaignEffectWorkerRepository;
  readonly ports: CampaignEffectPorts;
  readonly claimedAt: string;
  readonly limit?: number;
}): Promise<CampaignEffectWorkerResult> {
  const limit = input.limit ?? 50;
  if (
    !Number.isFinite(Date.parse(input.claimedAt)) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw invalid("Campaign effect worker input is invalid.");
  }
  const claimed = await input.repository.claim({
    limit,
    claimedAt: input.claimedAt,
  });
  const failures: { commandId: string; errorCode: string }[] = [];
  let completedCount = 0;

  for (const command of claimed) {
    try {
      const decoded = decodePurposeBuiltCommand(command);
      await dispatch(decoded, input.ports);
      await input.repository.complete({
        commandId: command.commandId,
        completedAt: input.claimedAt,
      });
      completedCount += 1;
    } catch (error) {
      const errorCode = readErrorCode(error);
      try {
        await input.repository.fail({
          commandId: command.commandId,
          errorCode,
        });
      } finally {
        failures.push({ commandId: command.commandId, errorCode });
      }
    }
  }

  return Object.freeze({
    claimedCount: claimed.length,
    completedCount,
    failedCount: failures.length,
    failures: Object.freeze(failures),
  });
}

export function decodePurposeBuiltCommand(
  command: ClaimedCampaignEffectCommand,
): PurposeBuiltCommand<CampaignEffectDefinition["kind"]> {
  if (
    !/^cec_[0-9a-f]{32}$/.test(command.commandId) ||
    !/^cmp_[0-9a-f]{32}$/.test(command.campaignId) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(
      command.idempotencyKey,
    ) ||
    !Number.isInteger(command.attemptCount) ||
    command.attemptCount < 1 ||
    command.attemptCount > 25 ||
    !isRecord(command.payload)
  ) {
    throw invalid("Claimed campaign command is malformed.");
  }

  const effect = decodeEffect(command.effectKind, command.payload);
  return Object.freeze({
    commandId: command.commandId,
    gameId: command.gameId,
    campaignId: command.campaignId,
    idempotencyKey: command.idempotencyKey,
    effect,
  });
}

async function dispatch(
  command: PurposeBuiltCommand<CampaignEffectDefinition["kind"]>,
  ports: CampaignEffectPorts,
): Promise<void> {
  switch (command.effect.kind) {
    case "publish_news":
      return ports.publishNews(
        command as PurposeBuiltCommand<"publish_news">,
      );
    case "create_contract":
      return ports.createContract(
        command as PurposeBuiltCommand<"create_contract">,
      );
    case "notify_players":
      return ports.notifyPlayers(
        command as PurposeBuiltCommand<"notify_players">,
      );
    case "apply_market_shock":
      return ports.applyMarketShock(
        command as PurposeBuiltCommand<"apply_market_shock">,
      );
    case "set_store_scarcity":
      return ports.setStoreScarcity(
        command as PurposeBuiltCommand<"set_store_scarcity">,
      );
    case "set_route_state":
      return ports.setRouteState(
        command as PurposeBuiltCommand<"set_route_state">,
      );
  }
}

function decodeEffect(
  kind: CampaignEffectDefinition["kind"],
  payload: Record<string, unknown>,
): CampaignEffectDefinition {
  switch (kind) {
    case "publish_news":
      return Object.freeze({
        kind,
        newsDefinitionId: definitionId(payload.newsDefinitionId),
        audience: audience(payload.audience),
      });
    case "create_contract":
      return Object.freeze({
        kind,
        contractDefinitionId: definitionId(payload.contractDefinitionId),
        targetLocationIds: publicLocationIds(payload.targetLocationIds),
      });
    case "notify_players":
      return Object.freeze({
        kind,
        notificationDefinitionId: definitionId(
          payload.notificationDefinitionId,
        ),
        audience: audience(payload.audience),
      });
    case "apply_market_shock":
      return Object.freeze({
        kind,
        marketShockDefinitionId: definitionId(
          payload.marketShockDefinitionId,
        ),
        magnitudeBasisPoints: boundedInteger(
          payload.magnitudeBasisPoints,
          -10_000,
          10_000,
          "market shock magnitude",
        ),
      });
    case "set_store_scarcity":
      return Object.freeze({
        kind,
        scarcityDefinitionId: definitionId(payload.scarcityDefinitionId),
        targetLocationIds: publicLocationIds(payload.targetLocationIds),
      });
    case "set_route_state": {
      const status = String(payload.state);
      const reason = String(payload.reason);
      if (![
        "open",
        "restricted",
        "closed",
      ].includes(status) || ![
        "shortage",
        "meridian_disruption",
        "war",
        "recovery",
      ].includes(reason)) {
        throw invalid("Route-state command status or reason is invalid.");
      }
      return Object.freeze({
        kind,
        routeDefinitionIds: publicRouteIds(payload.routeDefinitionIds),
        state: status as Extract<
          CampaignEffectDefinition,
          { kind: "set_route_state" }
        >["state"],
        reason: reason as Extract<
          CampaignEffectDefinition,
          { kind: "set_route_state" }
        >["reason"],
      });
    }
  }
}

function definitionId(value: unknown): string {
  const result = String(value ?? "");
  if (!/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(result)) {
    throw invalid("Effect definition identifier is invalid.");
  }
  return result;
}

function audience(
  value: unknown,
): "all_players" | "affected_locations" {
  if (value !== "all_players" && value !== "affected_locations") {
    throw invalid("Effect audience is invalid.");
  }
  return value;
}

function publicLocationIds(value: unknown): readonly string[] {
  return identifiers(value, /^loc_[a-z0-9_]+$/, "location");
}

function publicRouteIds(value: unknown): readonly string[] {
  return identifiers(value, /^rte_[a-z0-9_]+$/, "route");
}

function identifiers(
  value: unknown,
  pattern: RegExp,
  label: string,
): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 100 ||
    new Set(value).size !== value.length ||
    value.some((item) => typeof item !== "string" || !pattern.test(item))
  ) {
    throw invalid(`Effect ${label} identifiers are invalid.`);
  }
  return Object.freeze([...value] as string[]);
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw invalid(`${label} is invalid.`);
  }
  return number;
}

function readErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    /^[a-z0-9][a-z0-9._:-]{0,127}$/.test(
      (error as { code: string }).code,
    )
  ) {
    return (error as { code: string }).code;
  }
  return "campaign_effect_delivery_failed";
}

function invalid(message: string): CampaignRuntimeError {
  return new CampaignRuntimeError(
    "campaign_event_invalid",
    message,
    false,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
