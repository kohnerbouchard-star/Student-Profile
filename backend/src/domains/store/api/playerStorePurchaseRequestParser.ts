import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";

interface StorePurchaseQuoteBody {
  readonly itemId: string;
  readonly quantity: number;
}

interface StorePurchaseBody {
  readonly quoteId: string;
  readonly idempotencyKey: string;
  readonly clientSubmittedAt: string | null;
}

export async function readStoreQuoteBody(request: Request): Promise<StorePurchaseQuoteBody> {
  const body = await readJsonObject(request);
  const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
  const quantity = Number(body.quantity ?? 1);

  if (!itemId) {
    throw new EdgeActivationError(
      "invalid_request",
      "itemId is required.",
      400,
      false,
    );
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new EdgeActivationError(
      "invalid_request",
      "quantity must be a positive integer.",
      400,
      false,
    );
  }

  return { itemId, quantity };
}

export async function readStorePurchaseBody(request: Request): Promise<StorePurchaseBody> {
  const body = await readJsonObject(request);
  const quoteId = typeof body.quoteId === "string" ? body.quoteId.trim() : "";
  const idempotencyKey = typeof body.idempotencyKey === "string"
    ? body.idempotencyKey.trim()
    : "";
  const clientSubmittedAt = typeof body.clientSubmittedAt === "string"
    ? body.clientSubmittedAt
    : null;

  if (!quoteId) {
    throw new EdgeActivationError(
      "invalid_request",
      "quoteId is required.",
      400,
      false,
    );
  }

  if (!idempotencyKey) {
    throw new EdgeActivationError(
      "invalid_request",
      "idempotencyKey is required.",
      400,
      false,
    );
  }

  return { quoteId, idempotencyKey, clientSubmittedAt };
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new EdgeActivationError(
      "invalid_request",
      "Request body must be valid JSON.",
      400,
      false,
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new EdgeActivationError(
      "invalid_request",
      "Request body must be a JSON object.",
      400,
      false,
    );
  }

  return body as Record<string, unknown>;
}
