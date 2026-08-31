import {
  businessSellerOfferKeys,
  businessSellerPartyKeys,
  type PlayerStoreOfferProductPublicRepository,
  type PlayerStoreOfferPublicProductDto,
  type PlayerStoreOfferPublicScope,
  projectPlayerStoreOfferProduct,
} from "../contracts/playerStoreOfferPublicContracts.ts";
import {
  mapPlayerStoreOfferCatalogError,
  normalizePlayerStoreOfferScope,
} from "./playerStoreOfferPublicRepositoryErrors.ts";
import {
  type PlayerStoreOfferClient,
  PlayerStoreOfferPublicReadStore,
} from "./playerStoreOfferPublicReadStore.ts";
import { SupabaseStoreSellerOfferRepository } from "./supabaseStoreSellerOfferRepository.ts";

/**
 * Mutation-free Store offer-product projection for the authenticated Player
 * Store. Retail FX eligibility is decided by funded quote authority, not by
 * comparing the Player's country currency with the seller's currency.
 */
export class SupabasePlayerStoreOfferProductPublicRepository
  implements PlayerStoreOfferProductPublicRepository {
  private readonly catalogRepository: SupabaseStoreSellerOfferRepository;
  private readonly readStore: PlayerStoreOfferPublicReadStore;

  constructor(client: PlayerStoreOfferClient) {
    this.catalogRepository = new SupabaseStoreSellerOfferRepository(client);
    this.readStore = new PlayerStoreOfferPublicReadStore(client);
  }

  async listOfferProducts(
    input: PlayerStoreOfferPublicScope,
  ): Promise<readonly PlayerStoreOfferPublicProductDto[]> {
    const scope = normalizePlayerStoreOfferScope(input);
    try {
      const groups = await this.catalogRepository.listCatalogOfferGroups(
        scope.gameSessionId,
      );
      const identities = await this.readStore.readBusinessIdentities(
        scope.gameSessionId,
        businessSellerPartyKeys(groups),
      );
      const buyerOwnedBusinessIds = await this.readStore
        .readBuyerOwnedBusinessIds(
          scope,
          [...identities.values()].map((identity) => identity.businessId),
        );
      const unreservedBusinessOfferKeys = await this.readStore
        .readUnreservedBusinessOfferKeys(
          scope.gameSessionId,
          businessSellerOfferKeys(groups),
        );
      return groups.map((group) =>
        projectPlayerStoreOfferProduct(
          group,
          identities,
          scope.playerId,
          unreservedBusinessOfferKeys,
          buyerOwnedBusinessIds,
        )
      );
    } catch (error) {
      throw mapPlayerStoreOfferCatalogError(error);
    }
  }
}
