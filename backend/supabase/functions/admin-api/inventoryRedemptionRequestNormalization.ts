export async function normalizeInventoryRedemptionReviewRequest(
  request: Request,
): Promise<Request> {
  if (request.method !== "PATCH") return request;

  const value = await request.clone().json().catch(() => ({}));
  if (!value || typeof value !== "object" || Array.isArray(value)) return request;

  const source = value as Record<string, unknown>;
  const note = source.note ?? source.resolutionNote;
  if (note === undefined || source.note !== undefined) return request;

  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify({ ...source, note }),
  });
}
