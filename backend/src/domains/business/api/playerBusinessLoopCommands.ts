import { PlayerBusinessError, type PlayerBusinessRepository, type PlayerBusinessRoute } from "../contracts/playerBusinessContracts.ts";
import { readIdempotencyKey, readInteger, readKey, readMoney, validateBusinessRequestMethodAndFields } from "./playerBusinessRequestValidation.ts";

type LoopRoute = Extract<PlayerBusinessRoute, { kind: "businessStoreOfferPublish" | "businessEquipmentInstall" | "businessStoreOfferCreate" | "businessStoreOfferStock" }>;
export async function executeBusinessPlayerLoopCommand(repository: PlayerBusinessRepository, route: LoopRoute, body: Record<string, unknown>, scope: { gameSessionId: string; playerId: string }): Promise<Record<string, unknown>> {
  validateBusinessRequestMethodAndFields(route, "POST", body);
  const idempotencyKey = readIdempotencyKey(body.idempotencyKey);
  const args: Record<string, unknown> = { p_game_session_id: scope.gameSessionId, p_player_id: scope.playerId, p_idempotency_key: idempotencyKey };
  let command: string;
  if (route.kind === "businessEquipmentInstall") {
    command = "install_owned_business_equipment_v3";
    args.p_equipment_key = readKey(body.equipmentKey, "equipmentKey", "eqp");
  } else if (route.kind === "businessStoreOfferCreate") {
    command = "create_owned_business_store_offer_draft_v1";
    if (typeof body.itemKey !== "string" || !/^[a-z0-9_-]{1,64}$/u.test(body.itemKey)) throw new PlayerBusinessError("invalid_business_request", "Choose a valid Store item.", 400);
    args.p_store_item_key = body.itemKey;
    args.p_unit_price = readMoney(body.unitPrice, "unitPrice", 0.01, 1_000_000);
  } else {
    command = route.kind === "businessStoreOfferPublish" ? "publish_owned_business_store_offer_v1" : "stock_owned_business_store_offer_v1";
    args.p_offer_key = readKey(route.offerKey, "offerKey", "sof");
    if (route.kind === "businessStoreOfferStock") args.p_quantity = readInteger(body.quantity, "quantity", 1, 1_000_000);
    args.p_expected_offer_version = readInteger(body.expectedOfferVersion, "expectedOfferVersion", 1, Number.MAX_SAFE_INTEGER);
  }
  // Seller primitives are service-only: never let the caller select the Business.
  const snapshot = await repository.readBusiness(scope);
  if (!snapshot.configured || !snapshot.company.id) throw new PlayerBusinessError("business_not_found", "An active owned Business is required.", 404);
  args.p_business_key = readKey(snapshot.company.id, "businessKey", "biz");
  const result = await repository.execute(command, args);
  // Mutation receipts remain private to the server. Refresh canonical projections
  // instead of forwarding raw SQL output or newly introduced internal fields.
  return { replayed: result.replayed === true || result.alreadyCreated === true };
}
