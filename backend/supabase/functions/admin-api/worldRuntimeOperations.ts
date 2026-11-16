import {
  type Input,
  type OperationResult,
  adaptWorldRuntimeAdminService,
} from "./worldRuntimeContracts.ts";
import {
  readCampaign,
  readCampaignHistory,
  readCampaignEffects,
  controlCampaign,
  manualTrigger,
  recoverEffect,
} from "./campaignOperations.ts";
import {
  readArrivalClasses,
  correctArrivalClass,
  readGeography,
  updateRouteState,
  readTravel,
  readResidency,
} from "./worldTravelOperations.ts";
import {
  methodOrRoute,
  invalid,
} from "./worldRuntimeValidation.ts";


export async function handleWorldRuntimeAdminOperation(
  serviceSource: unknown,
  input: Input,
): Promise<OperationResult> {
  try {
    const service = adaptWorldRuntimeAdminService(serviceSource);
    if (input.suffix === "/world/campaign" && input.request.method === "GET") {
      return await readCampaign(service, input);
    }
    if (
      input.suffix === "/world/campaign/history" &&
      input.request.method === "GET"
    ) {
      return await readCampaignHistory(service, input);
    }
    if (
      input.suffix === "/world/campaign/effects" &&
      input.request.method === "GET"
    ) {
      return await readCampaignEffects(service, input);
    }
    if (
      input.suffix === "/world/campaign/control" &&
      input.request.method === "POST"
    ) {
      return await controlCampaign(service, input);
    }
    if (
      input.suffix === "/world/campaign/manual-trigger" &&
      input.request.method === "POST"
    ) {
      return await manualTrigger(service, input);
    }

    const recovery = input.suffix.match(
      /^\/world\/campaign\/effects\/(cec_[0-9a-f]{32})\/recover$/u,
    );
    if (recovery && input.request.method === "POST") {
      return await recoverEffect(service, input, recovery[1]!);
    }

    if (
      input.suffix === "/world/arrival-classes" &&
      input.request.method === "GET"
    ) {
      return await readArrivalClasses(service, input);
    }
    const correction = input.suffix.match(
      /^\/world\/arrival-classes\/(acl_[0-9a-f]{32})\/correct$/u,
    );
    if (correction && input.request.method === "POST") {
      return await correctArrivalClass(service, input, correction[1]!);
    }

    if (input.suffix === "/world/geography" && input.request.method === "GET") {
      return await readGeography(service, input);
    }
    if (
      input.suffix === "/world/routes/state" &&
      input.request.method === "POST"
    ) {
      return await updateRouteState(service, input);
    }
    if (input.suffix === "/world/travel" && input.request.method === "GET") {
      return await readTravel(service, input);
    }
    if (input.suffix === "/world/residency" && input.request.method === "GET") {
      return await readResidency(service, input);
    }

    return input.suffix.startsWith("/world/")
      ? methodOrRoute(input)
      : { handled: false };
  } catch (error) {
    return invalid(
      error instanceof Error ? error.message : "Invalid World administrator request.",
    );
  }
}
export type { WorldRuntimeAdminService } from "./worldRuntimeContracts.ts";
export { adaptWorldRuntimeAdminService } from "./worldRuntimeContracts.ts";
