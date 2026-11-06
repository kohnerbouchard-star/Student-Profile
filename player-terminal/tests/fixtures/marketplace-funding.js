export const LISTING = "lst_11111111111111111111111111111111";
export const RESERVATION = "mpr_22222222222222222222222222222222";
export const ORDER = "ord_33333333333333333333333333333333";
export const ACCOUNT = "bac_44444444444444444444444444444444";
export const QUOTE = "pfq_55555555555555555555555555555555";
export const RECEIPT = "pfr_66666666666666666666666666666666";
export const TRANSACTION = "btx_77777777777777777777777777777777";
export const FIXING = "fxf_88888888888888888888888888888888";
export const NOW = "2026-08-27T22:00:00.000Z";
export const EXPIRES = "2026-08-27T22:02:00.000Z";

export const quoteFixture = Object.freeze({
  ok: true,
  outcome: "applied",
  reservation: {
    reservationKey: RESERVATION,
    listingKey: LISTING,
    itemKey: "data-chip",
    quantity: 1,
    unitPrice: 15,
    subtotal: 15,
    feeRate: 0.025,
    taxRate: 0.01,
    feeAmount: 0.38,
    taxAmount: 0.15,
    buyerTotal: 15.53,
    sellerProceeds: 15,
    currencyCode: "LUM",
    status: "reserved",
    version: 1,
    listingVersion: 3,
    expiresAt: EXPIRES,
    replayed: false,
    fundingQuote: {
      quoteKey: QUOTE,
      fundingContextKind: "marketplace.purchase",
      fundingContextKey: RESERVATION,
      targetCurrencyCode: "LUM",
      targetMinorUnit: 2,
      targetAmount: 15.53,
      fixingKey: FIXING,
      policyVersion: "retail-checkout-v1",
      requiresFx: true,
      expiresAt: EXPIRES,
      lines: [{
        lineNumber: 1,
        sourceAccountKey: ACCOUNT,
        sourceCurrencyCode: "ECO",
        sourceMinorUnit: 2,
        targetCurrencyCode: "LUM",
        targetMinorUnit: 2,
        postedAmount: 100,
        heldAmount: 0,
        availableAmount: 100,
        targetContribution: 15.53,
        sourceDebit: 8.12,
        referenceRate: 2,
        customerRate: 1.98,
        effectiveRate: 1.9126,
        spreadRate: 0.01,
        requiresFx: true,
        roundingDisclosure: "Source debit is rounded up to the source minor unit.",
      }],
    },
  },
});

export const orderFixture = Object.freeze({
  ok: true,
  outcome: "applied",
  order: {
    orderKey: ORDER,
    reservationKey: RESERVATION,
    listingKey: LISTING,
    itemKey: "data-chip",
    quantity: 1,
    unitPrice: 15,
    subtotal: 15,
    feeAmount: 0.38,
    taxAmount: 0.15,
    buyerTotal: 15.53,
    sellerProceeds: 15,
    currencyCode: "LUM",
    status: "completed",
    version: 2,
    completedAt: NOW,
    refundedAt: null,
    replayed: false,
    fundingReceipt: {
      receiptKey: RECEIPT,
      quoteKey: QUOTE,
      bankTransactionKey: TRANSACTION,
      targetAccountKey: ACCOUNT,
      fundingContextKind: "marketplace.purchase",
      fundingContextKey: RESERVATION,
      targetCurrencyCode: "LUM",
      targetAmount: 15.53,
      targetReserveDrawAmount: 0,
      sourceDomain: "marketplace",
      sourceAction: "marketplace_purchase_funding",
      createdAt: NOW,
      lines: [{
        lineNumber: 1,
        sourceAccountKey: ACCOUNT,
        sourceCurrencyCode: "ECO",
        targetContribution: 15.53,
        sourceDebit: 8.12,
        referenceRate: 2,
        customerRate: 1.98,
        effectiveRate: 1.9126,
        spreadRate: 0.01,
        requiresFx: true,
      }],
    },
    distributionBankTransactionKey: TRANSACTION,
  },
});


