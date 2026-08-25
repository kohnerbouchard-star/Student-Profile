import { jsonResponse } from "../../../platform/supabase/edgeResponse.ts";
import type {
  PlayerStoreOfferPublicOfferDto,
  PlayerStoreOfferPublicProductDto,
  PlayerStoreOfferPublicQuoteDto,
  PlayerStoreOfferPublicReceiptDto,
} from "../contracts/playerStoreOfferPublicContracts.ts";

export function projectPlayerStorePublicOfferProduct(
  product: PlayerStoreOfferPublicProductDto,
): PlayerStoreOfferPublicProductDto {
  return {
    catalogItemKey: product.catalogItemKey,
    canonicalItemKey: product.canonicalItemKey,
    storeItemKey: product.storeItemKey,
    name: product.name,
    description: product.description,
    category: product.category,
    currencyCode: product.currencyCode,
    bestOfferKey: product.bestOfferKey,
    bestUnitPrice: product.bestUnitPrice,
    totalAvailableQuantity: product.totalAvailableQuantity,
    sellerCount: product.sellerCount,
    offerCount: product.offerCount,
    offers: product.offers.map(projectOffer),
    updatedAt: product.updatedAt,
  };
}

export function projectPlayerStorePublicOfferQuote(
  quote: PlayerStoreOfferPublicQuoteDto,
): PlayerStoreOfferPublicQuoteDto {
  return {
    quoteKey: quote.quoteKey,
    quoteStatus: quote.quoteStatus,
    offerKey: quote.offerKey,
    offerVersion: quote.offerVersion,
    businessKey: quote.businessKey,
    businessName: quote.businessName,
    sellerPartyKey: quote.sellerPartyKey,
    sellerName: quote.sellerName,
    catalogItemKey: quote.catalogItemKey,
    canonicalItemKey: quote.canonicalItemKey,
    storeItemKey: quote.storeItemKey,
    quantity: quote.quantity,
    availableQuantityAtQuote: quote.availableQuantityAtQuote,
    unitPrice: quote.unitPrice,
    totalPrice: quote.totalPrice,
    currencyCode: quote.currencyCode,
    expiresAt: quote.expiresAt,
    pricingVersion: quote.pricingVersion,
    replayed: quote.replayed,
  };
}

export function projectPlayerStorePublicOfferReceipt(
  receipt: PlayerStoreOfferPublicReceiptDto,
): PlayerStoreOfferPublicReceiptDto {
  return {
    receiptKey: receipt.receiptKey,
    quoteKey: receipt.quoteKey,
    offerKey: receipt.offerKey,
    businessKey: receipt.businessKey,
    businessName: receipt.businessName,
    sellerPartyKey: receipt.sellerPartyKey,
    sellerName: receipt.sellerName,
    catalogItemKey: receipt.catalogItemKey,
    canonicalItemKey: receipt.canonicalItemKey,
    storeItemKey: receipt.storeItemKey,
    quantity: receipt.quantity,
    unitPrice: receipt.unitPrice,
    totalPrice: receipt.totalPrice,
    currencyCode: receipt.currencyCode,
    offerVersionBefore: receipt.offerVersionBefore,
    offerVersionAfter: receipt.offerVersionAfter,
    remainingListedQuantity: receipt.remainingListedQuantity,
    completedAt: receipt.completedAt,
    alreadyCompleted: receipt.alreadyCompleted,
  };
}

export function playerStorePrivateJsonResponse<T>(
  status: number,
  body: T,
): Response {
  const response = jsonResponse<T>(status, body);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("vary", "authorization, x-player-session-token");
  return response;
}

function projectOffer(
  offer: PlayerStoreOfferPublicOfferDto,
): PlayerStoreOfferPublicOfferDto {
  return {
    offerKey: offer.offerKey,
    sellerKind: offer.sellerKind,
    sellerPartyKey: offer.sellerPartyKey,
    sellerName: offer.sellerName,
    businessKey: offer.businessKey,
    businessName: offer.businessName,
    unitPrice: offer.unitPrice,
    currencyCode: offer.currencyCode,
    availableQuantity: offer.availableQuantity,
    status: offer.status,
    purchasability: offer.purchasability,
    purchasable: offer.purchasable,
    version: offer.version,
  };
}
