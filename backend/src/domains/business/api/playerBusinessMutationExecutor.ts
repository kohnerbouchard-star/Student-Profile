import {
  PlayerBusinessError,
  type PlayerBusinessRepository,
  type PlayerBusinessRoute,
  type PlayerEconomicContext,
} from "../contracts/playerBusinessContracts.ts";
import {
  readEnum,
  readFormationOwners,
  readIdempotencyKey,
  readIndustryCode,
  readInteger,
  readKey,
  readMoney,
  readOptionalInteger,
  readText,
} from "./playerBusinessRequestValidation.ts";

type BusinessMutationRoute = Exclude<
  PlayerBusinessRoute,
  | { readonly kind: "businessRead" }
  | { readonly kind: "businessManufacturingCollection" }
  | { readonly kind: "businessManufacturingCancel" }
  | { readonly kind: "businessStoreQuote" }
  | { readonly kind: "businessStorePurchase" }
  | { readonly kind: "businessInputPurchase" }
  | { readonly kind: "businessCandidateHire" }
  | { readonly kind: "businessHire" }
>;

export async function executePlayerBusinessMutation(
  repository: PlayerBusinessRepository,
  route: BusinessMutationRoute,
  body: Record<string, unknown>,
  scope: { readonly gameSessionId: string; readonly playerId: string },
): Promise<Record<string, unknown>> {
  const base = {
    p_game_session_id: scope.gameSessionId,
    p_player_id: scope.playerId,
  };

  switch (route.kind) {
    case "businessCreate": {
      if (route.operation === "formationPropose") {
        return repository.execute("propose_business_formation_v2", {
          ...base,
          p_legal_name: readText(body.legalName, "legalName", 2, 160),
          p_entity_type: readEnum(body.entityType, "entityType", [
            "sole_proprietorship",
            "partnership",
            "llc",
            "c_corporation",
          ]),
          p_industry_code: readIndustryCode(body.industryCode),
          p_owners: readFormationOwners(body.owners),
          p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
        });
      }
      if (route.operation === "formationRespond") {
        return repository.execute("respond_business_formation_v2", {
          ...base,
          p_formation_key: route.formationKey,
          p_decision: readEnum(body.decision, "decision", [
            "approve",
            "reject",
          ]),
          p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
        });
      }
      if (route.operation === "formationActivate") {
        return repository.execute("activate_business_formation_v2", {
          ...base,
          p_formation_key: route.formationKey,
          p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
        });
      }

      const idempotencyKey = readIdempotencyKey(body.idempotencyKey);
      if (Object.hasOwn(body, "acquireBusinessKey")) {
        // Defense in depth for direct executor callers that do not traverse the
        // HTTP field validator. A malformed retired intent is invalid input;
        // only a valid retired Business key receives the stable retirement code.
        readKey(body.acquireBusinessKey, "acquireBusinessKey", "biz");
        throw new PlayerBusinessError(
          "business_direct_acquisition_retired",
          "Direct Business acquisition is retired; use registered ownership transfers.",
          410,
        );
      }
      const context = await readEconomicContext(repository, scope);
      await repository.assertBusinessCreationAllowed?.({
        ...scope,
        idempotencyKey,
      });
      return repository.execute("create_or_acquire_player_business_v1", {
        ...base,
        p_legal_name: readText(body.legalName, "legalName", 2, 120),
        p_entity_type: readEnum(body.entityType, "entityType", [
          "sole_proprietorship",
          "partnership",
          "corporation",
          "cooperative",
        ]),
        p_industry_code: readText(body.industryCode, "industryCode", 2, 80),
        p_country_code: context.countryCode,
        p_currency_code: context.currencyCode,
        p_capitalization: readMoney(
          body.capitalization,
          "capitalization",
          0,
          10_000_000,
        ),
        p_acquire_business_key: null,
        p_idempotency_key: idempotencyKey,
      });
    }
    case "businessProductCreate":
      return repository.execute("submit_business_product_v1", {
        ...base,
        p_business_key: readKey(body.businessKey, "businessKey", "biz"),
        p_name: readText(body.name, "name", 2, 120),
        p_category: readText(body.category, "category", 2, 80),
        p_unit_price: readMoney(body.unitPrice, "unitPrice", 0.01, 1_000_000),
        p_unit_input_cost: readMoney(
          body.unitInputCost,
          "unitInputCost",
          0,
          1_000_000,
        ),
        p_unit_labor_cost: readMoney(
          body.unitLaborCost,
          "unitLaborCost",
          0,
          1_000_000,
        ),
        p_capacity_units: readInteger(
          body.capacityUnits,
          "capacityUnits",
          1,
          100_000,
        ),
        // The retained V1 RPC still requires this transition argument. It is
        // server-owned and neutral until recipe activation replaces this route.
        p_base_demand_units: 0,
        p_quality_score: readInteger(
          body.qualityScore,
          "qualityScore",
          0,
          100,
        ),
        p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
      });
    case "businessProduction":
      return repository.execute("run_business_production_v1", {
        ...base,
        p_business_key: readKey(body.businessKey, "businessKey", "biz"),
        p_product_key: readKey(
          body.productKey ?? body.productId,
          "productKey",
          "bpr",
        ),
        p_quantity: readInteger(body.quantity, "quantity", 1, 10_000),
        p_priority: readEnum(body.priority ?? "standard", "priority", [
          "standard",
          "expedite",
        ]),
        p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
      });
    case "businessPrice":
      return repository.execute("set_business_product_price_v1", {
        ...base,
        p_business_key: readKey(body.businessKey, "businessKey", "biz"),
        p_product_key: route.productKey,
        p_price: readMoney(body.price, "price", 0.01, 1_000_000),
        p_expected_version: readOptionalInteger(
          body.expectedVersion,
          "expectedVersion",
          1,
          2_147_483_647,
        ),
        p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
      });
    case "businessTerminate":
      return repository.execute("terminate_business_employee_v1", {
        ...base,
        p_business_key: readKey(body.businessKey, "businessKey", "biz"),
        p_employee_key: route.employeeKey,
        p_reason: readText(body.reason, "reason", 2, 500),
        p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
      });
    case "businessStatus":
      return repository.execute("transition_business_status_v1", {
        ...base,
        p_business_key: readKey(body.businessKey, "businessKey", "biz"),
        p_transition: readEnum(body.transition, "transition", [
          "restructure",
          "recover",
          "close",
        ]),
        p_reason: readText(body.reason, "reason", 2, 500),
        p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
      });
  }

  throw new PlayerBusinessError(
    "unsupported_business_mutation",
    "This Business operation is not supported by the retained mutation executor.",
    405,
  );
}

async function readEconomicContext(
  repository: PlayerBusinessRepository,
  scope: { readonly gameSessionId: string; readonly playerId: string },
): Promise<PlayerEconomicContext> {
  if (repository.readEconomicContext) {
    return repository.readEconomicContext(scope);
  }
  const context = await repository.execute(
    "resolve_player_economic_context_v1",
    {
      p_game_session_id: scope.gameSessionId,
      p_player_id: scope.playerId,
    },
  );
  const countryCode = typeof context.country_code === "string"
    ? context.country_code
    : "";
  const currencyCode = typeof context.currency_code === "string"
    ? context.currency_code
    : "";
  if (!countryCode || !currencyCode) {
    throw new PlayerBusinessError(
      "player_economic_context_missing",
      "Player country and currency must be assigned before this action.",
      409,
    );
  }
  return { countryCode, currencyCode };
}
