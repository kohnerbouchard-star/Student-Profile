import { jsonResponse } from "../../../platform/supabase/edgeResponse.ts";
import type {
  PlayerStoreBusinessFundingQuoteDto,
  PlayerStoreBusinessFundingReceiptDto,
  PlayerStoreFundingQuoteDto,
  PlayerStoreFundingReceiptDto,
  PlayerStoreSeededFundingQuoteDto,
  PlayerStoreSeededFundingReceiptDto,
} from "../contracts/playerStoreFundingPublicContracts.ts";
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

export function projectPlayerStoreSeededFundingQuote(
  quote: PlayerStoreSeededFundingQuoteDto,
): PlayerStoreSeededFundingQuoteDto {
  return {
    quoteKey: quote.quoteKey,
    quoteStatus: quote.quoteStatus,
    itemKey: quote.itemKey,
    itemName: quote.itemName,
    quantity: quote.quantity,
    baseUnitPrice: quote.baseUnitPrice,
    inflationMultiplier: quote.inflationMultiplier,
    locationMultiplier: quote.locationMultiplier,
    scarcityMultiplier: quote.scarcityMultiplier,
    discountAmount: quote.discountAmount,
    finalUnitPrice: quote.finalUnitPrice,
    finalTotalPrice: quote.finalTotalPrice,
    currencyCode: quote.currencyCode,
    itemCurrencyCode: quote.itemCurrencyCode,
    playerCurrencyCode: quote.playerCurrencyCode,
    exchangeRate: quote.exchangeRate,
    itemLocalFinalUnitPrice: quote.itemLocalFinalUnitPrice,
    itemLocalFinalTotalPrice: quote.itemLocalFinalTotalPrice,
    expiresAt: quote.expiresAt,
    pricingVersion: quote.pricingVersion,
    replayed: quote.replayed,
    offerKey: quote.offerKey,
    offerVersion: quote.offerVersion,
    sellerKind: quote.sellerKind,
    sellerPartyKey: quote.sellerPartyKey,
    sellerName: quote.sellerName,
    availableQuantityAtQuote: quote.availableQuantityAtQuote,
    contextDigest: quote.contextDigest,
    fundingQuote: projectFundingQuote(quote.fundingQuote),
  };
}

export function projectPlayerStoreSeededFundingReceipt(
  receipt: PlayerStoreSeededFundingReceiptDto,
): PlayerStoreSeededFundingReceiptDto {
  return {
    receiptKey: receipt.receiptKey,
    quoteKey: receipt.quoteKey,
    itemKey: receipt.itemKey,
    itemName: receipt.itemName,
    quantity: receipt.quantity,
    finalUnitPrice: receipt.finalUnitPrice,
    finalTotalPrice: receipt.finalTotalPrice,
    currencyCode: receipt.currencyCode,
    inventoryQuantityOwned: receipt.inventoryQuantityOwned,
    offerKey: receipt.offerKey,
    sellerKind: receipt.sellerKind,
    sellerPartyKey: receipt.sellerPartyKey,
    sellerName: receipt.sellerName,
    offerVersionBefore: receipt.offerVersionBefore,
    offerVersionAfter: receipt.offerVersionAfter,
    remainingSellerQuantity: receipt.remainingSellerQuantity,
    sellerProceeds: receipt.sellerProceeds,
    inventoryTransactionKey: receipt.inventoryTransactionKey,
    completedAt: receipt.completedAt,
    alreadyCompleted: receipt.alreadyCompleted,
    contextDigest: receipt.contextDigest,
    fundingReceipt: projectFundingReceipt(receipt.fundingReceipt),
  };
}

export function projectPlayerStoreBusinessFundingQuote(
  quote: PlayerStoreBusinessFundingQuoteDto,
): PlayerStoreBusinessFundingQuoteDto {
  return {
    ...projectPlayerStorePublicOfferQuote(quote),
    contextDigest: quote.contextDigest,
    fundingQuote: projectFundingQuote(quote.fundingQuote),
  };
}

export function projectPlayerStoreBusinessFundingReceipt(
  receipt: PlayerStoreBusinessFundingReceiptDto,
): PlayerStoreBusinessFundingReceiptDto {
  return {
    ...projectPlayerStorePublicOfferReceipt(receipt),
    contextDigest: receipt.contextDigest,
    fundingReceipt: projectFundingReceipt(receipt.fundingReceipt),
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
    inventoryTransactionKey: receipt.inventoryTransactionKey,
    quantity: receipt.quantity,
    unitPrice: receipt.unitPrice,
    totalPrice: receipt.totalPrice,
    sellerProceeds: receipt.sellerProceeds,
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

function projectFundingQuote(
  quote: PlayerStoreFundingQuoteDto,
): PlayerStoreFundingQuoteDto {
  return {
    quoteKey: quote.quoteKey,
    fundingContextKind: quote.fundingContextKind,
    fundingContextKey: quote.fundingContextKey,
    targetCurrencyCode: quote.targetCurrencyCode,
    targetMinorUnit: quote.targetMinorUnit,
    targetAmount: quote.targetAmount,
    fixingKey: quote.fixingKey,
    policyVersion: quote.policyVersion,
    requiresFx: quote.requiresFx,
    expiresAt: quote.expiresAt,
    lines: quote.lines.map((line) => ({
      lineNumber: line.lineNumber,
      sourceAccountKey: line.sourceAccountKey,
      sourceCurrencyCode: line.sourceCurrencyCode,
      sourceMinorUnit: line.sourceMinorUnit,
      targetCurrencyCode: line.targetCurrencyCode,
      targetMinorUnit: line.targetMinorUnit,
      postedAmount: line.postedAmount,
      heldAmount: line.heldAmount,
      availableAmount: line.availableAmount,
      targetContribution: line.targetContribution,
      sourceDebit: line.sourceDebit,
      referenceRate: line.referenceRate,
      customerRate: line.customerRate,
      effectiveRate: line.effectiveRate,
      spreadRate: line.spreadRate,
      requiresFx: line.requiresFx,
      roundingDisclosure: line.roundingDisclosure,
    })),
  };
}

function projectFundingReceipt(
  receipt: PlayerStoreFundingReceiptDto,
): PlayerStoreFundingReceiptDto {
  return {
    receiptKey: receipt.receiptKey,
    quoteKey: receipt.quoteKey,
    bankTransactionKey: receipt.bankTransactionKey,
    targetAccountKey: receipt.targetAccountKey,
    fundingContextKind: receipt.fundingContextKind,
    fundingContextKey: receipt.fundingContextKey,
    targetCurrencyCode: receipt.targetCurrencyCode,
    targetMinorUnit: receipt.targetMinorUnit,
    targetAmount: receipt.targetAmount,
    targetReserveDrawAmount: receipt.targetReserveDrawAmount,
    sourceDomain: receipt.sourceDomain,
    sourceAction: receipt.sourceAction,
    createdAt: receipt.createdAt,
    lines: receipt.lines.map((line) => ({
      lineNumber: line.lineNumber,
      sourceAccountKey: line.sourceAccountKey,
      sourceCurrencyCode: line.sourceCurrencyCode,
      sourceMinorUnit: line.sourceMinorUnit,
      targetCurrencyCode: line.targetCurrencyCode,
      targetMinorUnit: line.targetMinorUnit,
      targetContribution: line.targetContribution,
      sourceDebit: line.sourceDebit,
      referenceRate: line.referenceRate,
      customerRate: line.customerRate,
      effectiveRate: line.effectiveRate,
      spreadRate: line.spreadRate,
      requiresFx: line.requiresFx,
    })),
  };
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
