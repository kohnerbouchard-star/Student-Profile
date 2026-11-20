import type {
  BusinessStoreOfferReceiptDto,
  SettleBusinessStoreOfferCommand,
  StoreOfferSettlementRepository,
} from "../contracts/storeOfferSettlementContracts.ts";

export interface SettleBusinessStoreOfferDependencies {
  readonly settlementRepository: StoreOfferSettlementRepository;
}

/** Trusted Store application boundary; PostgreSQL derives every economic fact. */
export function settleBusinessStoreOffer(
  command: SettleBusinessStoreOfferCommand,
  dependencies: SettleBusinessStoreOfferDependencies,
): Promise<BusinessStoreOfferReceiptDto> {
  return dependencies.settlementRepository.settleBusinessOffer(command);
}
