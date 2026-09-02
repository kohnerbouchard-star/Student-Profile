/// <reference lib="dom" />

import { EdgeActivationError, jsonError, jsonResponse } from "../../../platform/supabase/edgeResponse.ts";
import { type EdgeSupabaseClient, readSupabaseEnv, type SupabaseEnv } from "../../../platform/supabase/edgeStaffSession.ts";
import type { PlayerRequestApplicationContext } from "../../players/index.ts";
import { PlayerBusinessError, type PlayerBusinessRepository, type PlayerBusinessRoute } from "../contracts/playerBusinessContracts.ts";
import { BusinessTreasuryError, type BusinessTreasuryRepositoryV1 } from "../contracts/businessTreasuryContracts.ts";
import { readBusinessEquipment, readBusinessRecipes, readBusinessStockroom, readBusinessWorkspaceProjection } from "../infrastructure/supabaseBusinessStockroomReadRepository.ts";
import { SupabasePlayerBusinessRepository } from "../infrastructure/supabasePlayerBusinessRepository.ts";
import { executePlayerBusinessMutation } from "./playerBusinessMutationExecutor.ts";
import { readBusinessRequestBody, validateBusinessRequestEnvelope, validateBusinessRequestMethodAndFields } from "./playerBusinessRequestValidation.ts";
import { createBusinessStoreQuote, purchaseBusinessStoreQuote } from "./playerBusinessStoreProcurement.ts";
import { hireBusinessWorkforceCandidate, readBusinessWorkforceCandidates } from "./playerBusinessWorkforce.ts";
import { cancelPlayerBusinessManufacturingJob, readPlayerBusinessManufacturingJobs, startPlayerBusinessManufacturingJob } from "./playerBusinessManufacturing.ts";
import { dispatchPlayerBusinessTreasuryRequest } from "./playerBusinessTreasuryHttpDispatch.ts";

export interface PlayerBusinessRequestScope { readonly gameId: string; readonly playerUuid: string }
export interface PlayerBusinessHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly resolveScope: (request: Request, client: EdgeSupabaseClient, body: Record<string, unknown>) => Promise<PlayerBusinessRequestScope>;
  readonly readEnvironment?: typeof readSupabaseEnv;
  readonly createRepository?: (client: EdgeSupabaseClient) => PlayerBusinessRepository;
  readonly createTreasuryRepository?: (client: EdgeSupabaseClient) => BusinessTreasuryRepositoryV1;
}

export async function handlePlayerBusinessRequest(
  request: Request,
  route: PlayerBusinessRoute,
  dependencies: PlayerBusinessHttpHandlerDependencies,
  applicationContext?: PlayerRequestApplicationContext,
): Promise<Response> {
  try {
    validateBusinessRequestEnvelope(request);
    const isRead = route.kind === "businessRead" || route.kind === "businessTreasuryRead" || (route.kind === "businessManufacturingCollection" && request.method === "GET");
    const body = await readBusinessRequestBody(request, isRead);
    validateBusinessRequestMethodAndFields(route, request.method, body);
    const environment = (dependencies.readEnvironment ?? readSupabaseEnv)();
    if (!environment.ok) return jsonError(500, { code: "missing_edge_runtime_config", message: "Classroom API runtime configuration is incomplete.", retryable: false });

    const client = dependencies.createServiceClient(environment.value);
    const scope = applicationContext
      ? { gameId: applicationContext.gameSessionId, playerUuid: applicationContext.actor.playerUuid }
      : await dependencies.resolveScope(request, client, body);
    const repository = dependencies.createRepository ? dependencies.createRepository(client) : new SupabasePlayerBusinessRepository(client);
    const publicScope = { gameSessionId: scope.gameId, playerId: scope.playerUuid };

    const treasuryResponse = await dispatchPlayerBusinessTreasuryRequest({ route, body, client, publicScope, createTreasuryRepository: dependencies.createTreasuryRepository });
    if (treasuryResponse) return treasuryResponse;

    if (route.kind === "businessRead") return await handleBusinessRead(route, client, repository, publicScope);
    if (route.kind === "businessManufacturingCollection") {
      if (request.method === "GET") return privateJson(200, { jobs: await readPlayerBusinessManufacturingJobs(client, publicScope, route.businessKey) });
      return privateJson(200, { ok: true, result: await startPlayerBusinessManufacturingJob(client, publicScope, route.businessKey, body), refreshRequired: true });
    }
    if (route.kind === "businessManufacturingCancel") return privateJson(200, { ok: true, result: await cancelPlayerBusinessManufacturingJob(client, publicScope, route.businessKey, route.jobKey, body), refreshRequired: true });
    if (route.kind === "businessProduction") return retired("business_instant_production_retired", "Instant Business production has been retired. Use server-timed manufacturing.");
    if (route.kind === "businessInputPurchase") return retired("business_input_purchase_retired", "Legacy abstract Business input purchasing has been retired. Use Business Store procurement.");
    if (route.kind === "businessHire") return retired("business_free_text_hiring_retired", "Free-text Business hiring has been retired. Select an available workforce candidate.");
    if (route.kind === "businessCandidateHire") return privateJson(200, { ok: true, receipt: await hireBusinessWorkforceCandidate(repository, publicScope, route.candidateKey, body), refreshRequired: true });
    if (route.kind === "businessStoreQuote") return privateJson(200, { ok: true, quote: await createBusinessStoreQuote(repository, publicScope, body), refreshRequired: false });
    if (route.kind === "businessStorePurchase") return privateJson(200, { ok: true, receipt: await purchaseBusinessStoreQuote(repository, publicScope, body), refreshRequired: true });
    const result = await executePlayerBusinessMutation(repository, route, body, publicScope);
    return privateJson(200, { ok: true, result, refreshRequired: true });
  } catch (error) {
    if (error instanceof BusinessTreasuryError || error instanceof PlayerBusinessError || error instanceof EdgeActivationError) {
      return jsonError(error.status, { code: error.code, message: error.message, retryable: error.retryable });
    }
    return jsonError(500, { code: "player_business_request_failed", message: "The Business request could not be completed.", retryable: false });
  }
}

type PublicScope = { readonly gameSessionId: string; readonly playerId: string };
async function handleBusinessRead(
  route: Extract<PlayerBusinessRoute, { readonly kind: "businessRead" }>,
  client: EdgeSupabaseClient,
  repository: PlayerBusinessRepository,
  publicScope: PublicScope,
): Promise<Response> {
  if (route.resource === "stockroom") return privateJson(200, await readBusinessStockroom(client, publicScope));
  if (route.resource === "recipes") return privateJson(200, { recipes: await readBusinessRecipes(client, publicScope) });
  if (route.resource === "equipment") return privateJson(200, { equipment: await readBusinessEquipment(client, publicScope) });
  if (route.resource === "workforceCandidates") return privateJson(200, await readBusinessWorkforceCandidates(repository, publicScope));
  const snapshot = await repository.readBusiness(publicScope);
  const manufacturingJobs = snapshot.configured && snapshot.company.id ? await readPlayerBusinessManufacturingJobs(client, publicScope, snapshot.company.id) : [];
  const workspace = snapshot.configured ? await readBusinessWorkspaceProjection(client, publicScope) : { governance: null, productionReadiness: [], salesOffers: [], activity: [] };
  return privateJson(200, { ...snapshot, manufacturingJobs, ...workspace });
}

function retired(code: string, message: string): Response { return jsonError(410, { code, message, retryable: false }); }
function privateJson(status: number, body: unknown): Response {
  return jsonResponse(status, body, {
    "cache-control": "private, no-store, max-age=0",
    "pragma": "no-cache",
    "vary": "Origin, Authorization, X-Player-Session-Token, X-Econovaria-Device-Id",
  });
}
