import { executeBusinessPlayerLoopCommand } from "./playerBusinessLoopCommands.ts";
import type { PlayerBusinessRepository } from "../contracts/playerBusinessContracts.ts";
import { readPlayerBusinessRoutePath } from "./playerBusinessRoutePaths.ts";
const biz = `biz_${"a".repeat(32)}`;
const offer = `sof_${"b".repeat(32)}`;
const equipment = `eqp_${"c".repeat(32)}`;
const scope = { gameSessionId: "trusted-game", playerId: "trusted-player" };
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  }
}
const cases = [
  {
    kind: "businessEquipmentInstall",
    path: "/business/equipment/install",
    body: { equipmentKey: equipment },
    command: "install_owned_business_equipment_v3",
  },
  {
    kind: "businessStoreOfferCreate",
    path: "/business/store/offers",
    body: { itemKey: "finished_goods", unitPrice: 12 },
    command: "create_owned_business_store_offer_draft_v1",
  },
  {
    kind: "businessStoreOfferStock",
    path: `/business/store/offers/${offer}/stock`,
    body: { quantity: 2, expectedOfferVersion: 3 },
    command: "stock_owned_business_store_offer_v1",
  },
  {
    kind: "businessStoreOfferPublish",
    path: `/business/store/offers/${offer}/publish`,
    body: { expectedOfferVersion: 4 },
    command: "publish_owned_business_store_offer_v1",
  },
] as const;
for (const item of cases) {
  Deno.test(`${item.kind} derives owner scope, preserves replay key and strips private receipts`, async () => {
    const calls: Record<string, unknown>[] = [];
    const repository = {
      readBusiness: (input: unknown) => {
        equal(input, scope);
        return Promise.resolve({ configured: true, company: { id: biz } });
      },
      execute: (command: string, args: Record<string, unknown>) => {
        equal(command, item.command);
        calls.push(args);
        return Promise.resolve({ replayed: true, privateUuid: "secret" });
      },
    } as unknown as PlayerBusinessRepository;
    const route = readPlayerBusinessRoutePath(`/players/me${item.path}`)!;
    equal(route.kind, item.kind);
    const body = { ...item.body, idempotencyKey: "loop-command-001" };
    equal(
      await executeBusinessPlayerLoopCommand(
        repository,
        route as Parameters<typeof executeBusinessPlayerLoopCommand>[1],
        body,
        scope,
      ),
      { replayed: true },
    );
    equal(calls[0].p_game_session_id, scope.gameSessionId);
    equal(calls[0].p_business_key, biz);
    equal(calls[0].p_player_id, scope.playerId);
    equal(calls[0].p_idempotency_key, body.idempotencyKey);
    for (
      const field of [
        "businessKey",
        "playerId",
        "gameSessionId",
        "status",
        "inventoryAccountKey",
      ]
    ) {
      let rejected = false;
      try {
        await executeBusinessPlayerLoopCommand(
          repository,
          route as Parameters<typeof executeBusinessPlayerLoopCommand>[1],
          { ...body, [field]: "forged" },
          scope,
        );
      } catch {
        rejected = true;
      }
      equal(rejected, true);
    }
    equal(calls.length, 1);
  });
  Deno.test(`${item.kind} refuses missing owned business without executing`, async () => {
    let wrote = false;
    const repository = {
      readBusiness: () =>
        Promise.resolve({ configured: false, company: { id: "" } }),
      execute: () => {
        wrote = true;
        return Promise.resolve({});
      },
    } as unknown as PlayerBusinessRepository;
    let rejected = false;
    try {
      await executeBusinessPlayerLoopCommand(
        repository,
        readPlayerBusinessRoutePath(`/players/me${item.path}`) as Parameters<
          typeof executeBusinessPlayerLoopCommand
        >[1],
        { ...item.body, idempotencyKey: "loop-command-001" },
        scope,
      );
    } catch {
      rejected = true;
    }
    equal(rejected, true);
    equal(wrote, false);
  });
}
Deno.test("Business offer commands reject internal UUID and malformed public route keys", () => {
  for (const key of ["00000000-0000-4000-8000-000000000001", biz, "sof_bad"]) {
    equal(
      readPlayerBusinessRoutePath(
        `/players/me/business/store/offers/${key}/stock`,
      ),
      null,
    );
    equal(
      readPlayerBusinessRoutePath(
        `/players/me/business/store/offers/${key}/publish`,
      ),
      null,
    );
  }
});

import { handlePlayerBusinessRequest } from "./playerBusinessHttpHandler.ts";
import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";
for (const item of cases) {
  Deno.test(`${item.kind} refuses expired session before business reads or mutations`, async () => {
    let accessed = false;
    const response = await handlePlayerBusinessRequest(
      new Request(`https://example.test/players/me${item.path}`, {
        method: "POST",
        headers: {
          "x-player-session-token": "expired-session",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...item.body,
          idempotencyKey: "loop-command-001",
        }),
      }),
      readPlayerBusinessRoutePath(`/players/me${item.path}`)!,
      {
        createServiceClient: () => ({}) as never,
        readEnvironment: () => ({
          ok: true,
          value: {
            supabaseUrl: "https://example.test",
            supabaseAnonKey: "anon",
            supabaseServiceRoleKey: "service",
          },
        }),
        resolveScope: () => {
          throw new EdgeActivationError(
            "player_session_expired",
            "Player session expired.",
            401,
          );
        },
        createRepository: () => {
          accessed = true;
          throw new Error("Unauthorized repository access");
        },
      },
    );
    equal(response.status, 401);
    equal(accessed, false);
  });
}

import { mapPlayerBusinessDatabaseError } from "../infrastructure/playerBusinessDatabaseErrors.ts";
for (
  const [code, status] of Object.entries({
    STORE_SELLER_OFFER_BUSINESS_CURRENT_EXISTS: 409,
    STORE_LISTING_STOCK_OFFER_NOT_FOUND: 404,
    STORE_LISTING_STOCK_OFFER_RETIRED: 409,
    STORE_SELLER_OFFER_STORE_ITEM_NOT_FOUND: 404,
    STORE_SELLER_OFFER_BUSINESS_PRODUCT_NOT_OWNED: 409,
    STORE_SELLER_OFFER_BUSINESS_CURRENCY_MISMATCH: 409,
    STORE_SELLER_OFFER_WITHDRAWAL_PENDING_MUTATION_FORBIDDEN: 409,
    BUSINESS_EQUIPMENT_INSTALLATION_CONFLICT: 409,
  })
) {
  Deno.test(`Business player loop maps ${code} to actionable HTTP ${status}`, () => {
    const error = mapPlayerBusinessDatabaseError(code);
    equal(error.status, status);
    equal(error.code, code.toLowerCase());
  });
}
