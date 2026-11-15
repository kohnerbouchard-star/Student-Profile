export const MAX_BODY_BYTES = 16 * 1024;

export const SIGNATURE_WINDOW_SECONDS = 5 * 60;

export const PAYMENT_TIMESTAMP_HEADER =
  "x-econovaria-payment-timestamp";

export const PAYMENT_SIGNATURE_HEADER =
  "x-econovaria-payment-signature";

export const SIGNATURE_PATTERN = /^v1=([0-9a-f]{64})$/iu;

export const IDENTIFIER_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,191}$/u;

export const PROVIDER_PATTERN =
  /^[a-z0-9][a-z0-9._-]{1,63}$/u;

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export const CURRENCY_PATTERN = /^[A-Z]{3}$/u;

export const ALLOWED_KEYS = new Set([
  "schemaVersion",
  "eventType",
  "provider",
  "eventId",
  "paymentId",
  "providerPriceRef",
  "customerEmail",
  "amountMinor",
  "currency",
  "occurredAt",
]);


export interface PaidLicenseEvent {
  readonly schemaVersion: 1;
  readonly eventType: "payment.succeeded";
  readonly provider: string;
  readonly eventId: string;
  readonly paymentId: string;
  readonly providerPriceRef: string;
  readonly customerEmail: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly occurredAt: string;
}
