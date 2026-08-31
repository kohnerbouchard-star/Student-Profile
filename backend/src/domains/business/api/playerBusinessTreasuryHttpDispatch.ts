/// <reference lib="dom" />

import { jsonResponse } from "../../../platform/supabase/edgeResponse.ts";
import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import type { PlayerBusinessRoute } from "../contracts/playerBusinessContracts.ts";
import type { BusinessTreasuryRepositoryV1 } from "../contracts/businessTreasuryContracts.ts";
import { SupabaseBusinessTreasuryRepository } from "../infrastructure/supabaseBusinessTreasuryRepository.ts";
import {
  parseBusinessTreasuryAccountOpenBody,
  parseBusinessTreasuryCancelBody,
  parseBusinessTreasuryConsumeBody,
  parseBusinessTreasuryQuoteBody,
} from "./playerBusinessTreasury.ts";

interface PlayerBusinessTreasuryHttpDispatchInput {
  readonly route: PlayerBusinessRoute;
  readonly body: Record<string, unknown>;
  readonly client: EdgeSupabaseClient;
  readonly publicScope: {
    readonly gameSessionId: string;
    readonly playerId: string;
  };
  readonly createTreasuryRepository?: (
    client: EdgeSupabaseClient,
  ) => BusinessTreasuryRepositoryV1;
}

export async function dispatchPlayerBusinessTreasuryRequest(
  input: PlayerBusinessTreasuryHttpDispatchInput,
): Promise<Response | null> {
  const { body, client, publicScope, route } = input;
  const createTreasuryRepository = () =>
    input.createTreasuryRepository
      ? input.createTreasuryRepository(client)
      : new SupabaseBusinessTreasuryRepository(client);

  if (route.kind === "businessTreasuryRead") {
    return privateJson(
      200,
      await createTreasuryRepository().readSnapshot(publicScope),
    );
  }

  if (route.kind === "businessTreasuryAccountOpen") {
    const result = await createTreasuryRepository().openCheckingAccount({
      ...publicScope,
      ...parseBusinessTreasuryAccountOpenBody(body),
    });
    return privateJson(result.outcome === "replayed" ? 200 : 201, {
      ok: true,
      outcome: result.outcome,
      account: result.value,
      refreshRequired: true,
    });
  }

  if (route.kind === "businessTreasuryFxQuote") {
    const result = await createTreasuryRepository().createQuote({
      ...publicScope,
      ...parseBusinessTreasuryQuoteBody(body),
    });
    return privateJson(result.outcome === "replayed" ? 200 : 201, {
      ok: true,
      outcome: result.outcome,
      quote: result.value,
      refreshRequired: false,
    });
  }

  if (
    route.kind === "businessTreasuryFxStandard" ||
    route.kind === "businessTreasuryFxInstant"
  ) {
    const treasury = createTreasuryRepository();
    const command = {
      ...publicScope,
      ...parseBusinessTreasuryConsumeBody(body),
    };
    const result = route.kind === "businessTreasuryFxStandard"
      ? await treasury.submitStandard(command)
      : await treasury.executeInstant(command);
    return privateJson(
      result.outcome === "replayed"
        ? 200
        : route.kind === "businessTreasuryFxStandard"
        ? 202
        : 201,
      {
        ok: true,
        outcome: result.outcome,
        order: result.value,
        refreshRequired: true,
      },
    );
  }

  if (route.kind === "businessTreasuryFxCancel") {
    const result = await createTreasuryRepository().cancelStandard({
      ...publicScope,
      orderKey: route.orderKey,
      ...parseBusinessTreasuryCancelBody(body),
    });
    return privateJson(200, {
      ok: true,
      outcome: result.outcome,
      order: result.value,
      refreshRequired: true,
    });
  }

  return null;
}

function privateJson(status: number, body: unknown): Response {
  return jsonResponse(status, body, {
    "cache-control": "private, no-store, max-age=0",
    "pragma": "no-cache",
    "vary":
      "Origin, Authorization, X-Player-Session-Token, X-Econovaria-Device-Id",
  });
}
