export const businessPlayerLoopDatabaseErrors: Record<
  string,
  [number, string, boolean?]
> = {
  BUSINESS_OFFER_PUBLISH_REQUEST_INVALID: [
    400,
    "The Business equipment or Store offer state does not permit this action. Refresh and review the request.",
  ],
  BUSINESS_OFFER_PUBLISH_STATUS_INVALID: [
    409,
    "The Business equipment or Store offer state does not permit this action. Refresh and review the request.",
  ],
  BUSINESS_OFFER_PUBLISH_STOCK_UNAVAILABLE: [
    409,
    "The Business equipment or Store offer state does not permit this action. Refresh and review the request.",
  ],
  STORE_SELLER_OFFER_VERSION_CONFLICT: [
    409,
    "The Business equipment or Store offer state does not permit this action. Refresh and review the request.",
  ],
  STORE_SELLER_OFFER_IDEMPOTENCY_CONFLICT: [
    409,
    "The Business equipment or Store offer state does not permit this action. Refresh and review the request.",
  ],
  STORE_LISTING_STOCK_OFFER_VERSION_CONFLICT: [
    409,
    "The Business equipment or Store offer state does not permit this action. Refresh and review the request.",
  ],
  STORE_LISTING_STOCK_IDEMPOTENCY_CONFLICT: [
    409,
    "The Business equipment or Store offer state does not permit this action. Refresh and review the request.",
  ],
  STORE_LISTING_STOCK_INSUFFICIENT_FINISHED_GOODS: [
    409,
    "The Business equipment or Store offer state does not permit this action. Refresh and review the request.",
  ],
  STORE_SELLER_OFFER_BUSINESS_CURRENT_EXISTS: [
    409,
    "The Business equipment or Store offer state does not permit this action. Refresh and review the request.",
  ],
  BUSINESS_EQUIPMENT_IDEMPOTENCY_CONFLICT: [
    409,
    "The Business equipment or Store offer state does not permit this action. Refresh and review the request.",
  ],
  BUSINESS_EQUIPMENT_INSTANCE_PLAYER_OWNED: [
    409,
    "The Business equipment or Store offer state does not permit this action. Refresh and review the request.",
  ],
  BUSINESS_EQUIPMENT_OWNERSHIP_MISMATCH: [
    409,
    "The Business equipment or Store offer state does not permit this action. Refresh and review the request.",
  ],
  BUSINESS_EQUIPMENT_ACCOUNT_INVALID: [
    409,
    "The Business equipment or Store offer state does not permit this action. Refresh and review the request.",
  ],
  BUSINESS_EQUIPMENT_ITEM_NOT_AVAILABLE: [
    409,
    "The Business equipment or Store offer state does not permit this action. Refresh and review the request.",
  ],
  BUSINESS_EQUIPMENT_INSTALL_REQUEST_INVALID: [
    400,
    "The Business equipment or Store offer state does not permit this action. Refresh and review the request.",
  ],
  STORE_SELLER_OFFER_NOT_FOUND: [
    404,
    "The Business equipment or Store offer state does not permit this action. Refresh and review the request.",
  ],
  BUSINESS_EQUIPMENT_INSTANCE_NOT_FOUND: [
    404,
    "The Business equipment or Store offer state does not permit this action. Refresh and review the request.",
  ],
  STORE_SELLER_OFFER_CREATE_REQUEST_INVALID: [
    400,
    "The Store offer request is invalid.",
  ],
  STORE_SELLER_OFFER_BUSINESS_NOT_FOUND: [
    404,
    "The Business is no longer available.",
  ],
  STORE_SELLER_OFFER_BUSINESS_PARTY_NOT_FOUND: [
    409,
    "The Business seller account is unavailable.",
  ],
  STORE_SELLER_OFFER_STORE_ITEM_NOT_FOUND: [
    404,
    "This product is no longer available in the Store catalog.",
  ],
  STORE_SELLER_OFFER_BUSINESS_CURRENCY_MISMATCH: [
    409,
    "The Store item and Business currencies must match.",
  ],
  STORE_SELLER_OFFER_BUSINESS_PRODUCT_NOT_OWNED: [
    409,
    "Only an active physical product of this Business can be offered.",
  ],
  STORE_LISTING_STOCK_REQUEST_INVALID: [
    400,
    "The Store stock request is invalid.",
  ],
  STORE_LISTING_STOCK_BUSINESS_NOT_FOUND: [
    404,
    "The Business is no longer available.",
  ],
  STORE_LISTING_STOCK_BUSINESS_PARTY_NOT_FOUND: [
    409,
    "The Business seller account is unavailable.",
  ],
  STORE_LISTING_STOCK_OFFER_NOT_FOUND: [
    404,
    "This Business Store offer was not found.",
  ],
  STORE_LISTING_STOCK_OFFER_RETIRED: [
    409,
    "A retired offer cannot be stocked. Refresh to choose a current offer.",
  ],
  STORE_LISTING_STOCK_IN_PROGRESS: [
    409,
    "This stock request is still processing. Retry the same request.",
  ],
  STORE_LISTING_STOCK_FINISHED_GOODS_NOT_FOUND: [
    409,
    "There are no Finished Goods available for this offer.",
  ],
  STORE_LISTING_STOCK_ACCOUNT_UNAVAILABLE: [
    409,
    "The Store listing account is unavailable.",
  ],
  STORE_LISTING_STOCK_FINISHED_ACCOUNT_UNAVAILABLE: [
    409,
    "The Finished Goods account is unavailable.",
  ],
  STORE_LISTING_STOCK_COST_CURRENCY_MISMATCH: [
    409,
    "Finished Goods and Store listing currencies must match.",
  ],
  STORE_SELLER_OFFER_WITHDRAWAL_PENDING_MUTATION_FORBIDDEN: [
    409,
    "Wait for the pending Store withdrawal before changing this offer.",
  ],
  BUSINESS_EQUIPMENT_INSTALLATION_CONFLICT: [
    409,
    "This equipment cannot be installed. Refresh to choose available equipment.",
  ],
};
