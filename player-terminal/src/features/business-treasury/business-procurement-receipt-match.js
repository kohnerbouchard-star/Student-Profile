import { ApiRequestError } from "../../api/errors.js";
import { amountsEqual } from "./business-treasury-flow-support.js";

export function assertProcurementReceiptMatchesQuote(receipt, quote) {
  if (
    receipt.businessKey !== quote.businessKey ||
    receipt.quoteKey !== quote.quoteKey ||
    receipt.itemKey !== quote.itemKey ||
    receipt.quantity !== quote.quantity ||
    receipt.fundingReceipt.quoteKey !== quote.fundingQuote.quoteKey ||
    receipt.fundingReceipt.targetAccountKey !== quote.fundingTargetAccountKey ||
    !amountsEqual(
      receipt.fundingReceipt.targetAmount.amount,
      quote.fundingQuote.targetAmount.amount,
      quote.fundingQuote.targetAmount.precision,
    )
  ) {
    throw new ApiRequestError("Business procurement returned a receipt for different terms.", {
      code: "INVALID_RESPONSE",
      endpointKey: "businessStorePurchase",
    });
  }
}
