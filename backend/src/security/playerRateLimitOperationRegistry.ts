import type { PlayerCapabilityEndpointKey } from "../domains/players/contracts/playerCapabilityManifestContracts.ts";
import type { PlayerRateLimitProfile } from "./rateLimitContracts.ts";

export interface ReviewedPlayerRateLimitOperation {
  readonly action: string;
  readonly profile: PlayerRateLimitProfile;
}

export type ReviewedPlayerRateLimitEndpointKey =
  | PlayerCapabilityEndpointKey
  | "inventoryRedemption"
  | "businessInputPurchase"
  | "businessRetiredHire"
  | "businessStoreWithdrawal";

const redemptionOperations = byMethod({
  GET: operation("player.inventory.redemptions.read", "read"),
  POST: operation("player.inventory.redemptions.request", "write"),
});

const REVIEWED_PLAYER_RATE_LIMIT_OPERATIONS: Readonly<
  Record<
    ReviewedPlayerRateLimitEndpointKey,
    Readonly<Partial<Record<string, ReviewedPlayerRateLimitOperation>>>
  >
> = Object.freeze({
  bootstrap: byMethod({ GET: operation("player.session.read", "read") }),
  capabilities: byMethod({
    GET: operation("player.capabilities.read", "read"),
  }),
  worldRuntime: byMethod({
    GET: operation("player.world.context.read", "read"),
  }),
  arrivalClass: byMethod({
    POST: operation("player.world.arrival.assign", "sensitive"),
  }),
  travelQuote: byMethod({
    POST: operation("player.world.travel.quote", "write"),
  }),
  travelExecute: byMethod({
    POST: operation("player.world.travel.execute", "sensitive"),
  }),
  travelComplete: byMethod({
    POST: operation("player.world.travel.complete", "write"),
  }),
  residencyRequest: byMethod({
    POST: operation("player.world.residency.request", "sensitive"),
  }),
  banking: byMethod({ GET: operation("player.banking.read", "read") }),
  bankingFx: byMethod({ GET: operation("player.banking.fx.read", "read") }),
  bankingFxHistory: byMethod({
    GET: operation("player.banking.fx.history.read", "read"),
  }),
  bankingFxOrders: byMethod({
    GET: operation("player.banking.fx.orders.read", "read"),
  }),
  bankingFxQuote: byMethod({
    POST: operation("player.banking.fx.quotes.create", "write"),
  }),
  bankingFxStandard: byMethod({
    POST: operation("player.banking.fx.orders.standard", "sensitive"),
  }),
  bankingFxInstant: byMethod({
    POST: operation("player.banking.fx.orders.instant", "sensitive"),
  }),
  bankingFxCancel: byMethod({
    POST: operation("player.banking.fx.orders.cancel", "sensitive"),
  }),
  bankTransfer: byMethod({
    POST: operation("player.banking.transfers.create", "sensitive"),
  }),
  business: byMethod({ GET: operation("player.business.read", "read") }),
  businessTreasury: byMethod({
    GET: operation("player.business.treasury.read", "read"),
  }),
  businessTreasuryAccountOpen: byMethod({
    POST: operation("player.business.treasury.accounts.open", "write"),
  }),
  businessTreasuryFxQuote: byMethod({
    POST: operation("player.business.treasury.fx.quotes.create", "write"),
  }),
  businessTreasuryFxStandard: byMethod({
    POST: operation("player.business.treasury.fx.orders.standard", "sensitive"),
  }),
  businessTreasuryFxInstant: byMethod({
    POST: operation("player.business.treasury.fx.orders.instant", "sensitive"),
  }),
  businessTreasuryFxCancel: byMethod({
    POST: operation("player.business.treasury.fx.orders.cancel", "sensitive"),
  }),
  businessStoreQuote: byMethod({
    POST: operation("player.business.store.quote", "write"),
  }),
  businessStorePurchase: byMethod({
    POST: operation("player.business.store.purchase", "sensitive"),
  }),
  businessStoreWithdrawal: byMethod({
    POST: operation("player.business.store.withdrawal", "write"),
  }),
  businessCreate: byMethod({
    POST: operation("player.business.create", "sensitive"),
  }),
  businessFormationPropose: byMethod({
    POST: operation("player.business.formation.propose", "sensitive"),
  }),
  businessFormationRespond: byMethod({
    POST: operation("player.business.formation.respond", "sensitive"),
  }),
  businessFormationActivate: byMethod({
    POST: operation("player.business.formation.activate", "sensitive"),
  }),
  businessWorkforce: byMethod({
    GET: operation("player.business.workforce.read", "read"),
  }),
  businessCandidateHire: byMethod({
    POST: operation("player.business.workforce.candidate.hire", "sensitive"),
  }),
  businessRetiredHire: byMethod({
    POST: operation("player.business.employees.hire.retired", "sensitive"),
  }),
  businessInputPurchase: byMethod({
    POST: operation("player.business.inputs.purchase.retired", "sensitive"),
  }),
  businessPrice: byMethod({
    POST: operation("player.business.pricing.write", "write"),
  }),
  businessProductCreate: byMethod({
    POST: operation("player.business.products.write", "write"),
  }),
  businessProduction: byMethod({
    POST: operation("player.business.production.run", "sensitive"),
  }),
  businessManufacturingJobs: byMethod({
    GET: operation("player.business.manufacturing.jobs.read", "read"),
  }),
  businessManufacturingStart: byMethod({
    POST: operation("player.business.manufacturing.jobs.start", "sensitive"),
  }),
  businessManufacturingCancel: byMethod({
    POST: operation("player.business.manufacturing.jobs.cancel", "sensitive"),
  }),
  businessStatus: byMethod({
    POST: operation("player.business.status.write", "sensitive"),
  }),
  businessTerminate: byMethod({
    POST: operation("player.business.employees.terminate", "write"),
  }),
  contractAccept: byMethod({
    POST: operation("player.contracts.accept", "write"),
  }),
  contractSubmit: byMethod({
    POST: operation("player.contracts.submit", "write"),
  }),
  contracts: byMethod({ GET: operation("player.contracts.read", "read") }),
  countries: byMethod({ GET: operation("player.countries.read", "read") }),
  country: byMethod({ GET: operation("player.country.read", "read") }),
  dashboard: byMethod({ GET: operation("player.dashboard.read", "read") }),
  inventory: byMethod({ GET: operation("player.inventory.read", "read") }),
  inventoryRedemption: redemptionOperations,
  inventoryRedemptions: redemptionOperations,
  loanApply: byMethod({ POST: operation("player.loans.apply", "sensitive") }),
  loanRepay: byMethod({ POST: operation("player.loans.repay", "sensitive") }),
  loans: byMethod({ GET: operation("player.loans.read", "read") }),
  logout: byMethod({ POST: operation("player.session.logout", "sensitive") }),
  market: byMethod({ GET: operation("player.market.read", "read") }),
  marketAsset: byMethod({ GET: operation("player.asset.read", "read") }),
  marketOrder: byMethod({
    POST: operation("player.market.order", "sensitive"),
  }),
  marketWatchlist: byMethod({
    DELETE: operation("player.watchlist.write", "write"),
    GET: operation("player.watchlist.read", "read"),
    PUT: operation("player.watchlist.write", "write"),
  }),
  messages: byMethod({ GET: operation("player.messages.read", "read") }),
  messageThread: byMethod({
    GET: operation("player.messages.thread.read", "read"),
  }),
  messagePolicy: byMethod({
    GET: operation("player.messages.policy.read", "read"),
  }),
  messageSearch: byMethod({
    GET: operation("player.messages.search", "read"),
  }),
  messageThreadCreate: byMethod({
    POST: operation("player.messages.thread.create", "sensitive"),
  }),
  messageSend: byMethod({
    POST: operation("player.messages.send", "sensitive"),
  }),
  messageRead: byMethod({
    POST: operation("player.messages.receipt", "write"),
  }),
  marketplace: byMethod({ GET: operation("player.marketplace.read", "read") }),
  marketplaceListing: byMethod({
    POST: operation("player.marketplace.listing.create", "write"),
  }),
  marketplaceActivate: byMethod({
    POST: operation("player.marketplace.listing.activate", "write"),
  }),
  marketplacePurchase: byMethod({
    POST: operation("player.marketplace.purchase", "sensitive"),
  }),
  marketplaceCancel: byMethod({
    POST: operation("player.marketplace.listing.cancel", "write"),
  }),
  marketplaceDispute: byMethod({
    POST: operation("player.marketplace.dispute.open", "sensitive"),
  }),
  news: byMethod({ GET: operation("player.news.read", "read") }),
  notifications: byMethod({
    GET: operation("player.notifications.read", "read"),
  }),
  notificationsRead: byMethod({
    POST: operation("player.notifications.write", "write"),
  }),
  storyDeliveries: byMethod({
    GET: operation("player.story.deliveries.read", "read"),
  }),
  storyDeliveryState: byMethod({
    POST: operation("player.story.deliveries.write", "write"),
  }),
  portfolio: byMethod({ GET: operation("player.portfolio.read", "read") }),
  progression: byMethod({ GET: operation("player.progression.read", "read") }),
  progressionUnlock: byMethod({
    POST: operation("player.progression.skill.unlock", "sensitive"),
  }),
  progressionClaim: byMethod({
    POST: operation("player.progression.reward.claim", "sensitive"),
  }),
  savingsTransfer: byMethod({
    POST: operation("player.banking.savings.transfer", "sensitive"),
  }),
  store: byMethod({ GET: operation("player.store.read", "read") }),
  storeQuote: byMethod({ POST: operation("player.store.quote", "write") }),
  storePurchase: byMethod({
    GET: operation("player.store.purchases.read", "read"),
    POST: operation("player.store.purchase", "sensitive"),
  }),
});

export function readReviewedPlayerRateLimitOperation(
  endpointKey: ReviewedPlayerRateLimitEndpointKey,
  method: string,
): ReviewedPlayerRateLimitOperation | null {
  return REVIEWED_PLAYER_RATE_LIMIT_OPERATIONS[endpointKey][
    method.toUpperCase()
  ] ?? null;
}

function operation(
  action: string,
  profile: PlayerRateLimitProfile,
): ReviewedPlayerRateLimitOperation {
  return Object.freeze({ action, profile });
}

function byMethod(
  operations: Readonly<Record<string, ReviewedPlayerRateLimitOperation>>,
) {
  return Object.freeze(operations);
}
