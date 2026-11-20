export const MAX_BODY_BYTES = 256 * 1024;

export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export const MAX_LINE_ITEM_RESPONSE_BYTES = 256 * 1024;

export const STRIPE_SIGNATURE_HEADER = "stripe-signature";

export const INTERNAL_TIMESTAMP_HEADER = "x-econovaria-payment-timestamp";

export const INTERNAL_SIGNATURE_HEADER = "x-econovaria-payment-signature";

export const ALLOWED_PAYMENT_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

export const ACKNOWLEDGED_NON_PAYMENT_EVENT_TYPES = new Set([
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
]);

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;


export interface StripeEventEnvelope {
  readonly id?: string;
  readonly object?: string;
  readonly type?: string;
  readonly created?: number;
  readonly livemode?: boolean;
  readonly data?: { readonly object?: unknown };
}


export interface StripeCheckoutSession {
  readonly id?: string;
  readonly object?: string;
  readonly livemode?: boolean;
  readonly mode?: string;
  readonly payment_status?: string;
  readonly payment_intent?: string | { readonly id?: string } | null;
  readonly amount_subtotal?: number | null;
  readonly currency?: string | null;
  readonly customer_email?: string | null;
  readonly customer_details?: { readonly email?: string | null } | null;
  readonly metadata?: Record<string, string> | null;
}


export interface StripePrice {
  readonly id?: string;
  readonly object?: string;
  readonly active?: boolean;
  readonly currency?: string;
  readonly unit_amount?: number | null;
  readonly product?: string | { readonly id?: string } | null;
}


export interface StripeLineItem {
  readonly id?: string;
  readonly object?: string;
  readonly quantity?: number | null;
  readonly amount_subtotal?: number;
  readonly currency?: string;
  readonly price?: StripePrice | string | null;
}


export interface StripeLineItemList {
  readonly object?: string;
  readonly data?: StripeLineItem[];
  readonly has_more?: boolean;
}
