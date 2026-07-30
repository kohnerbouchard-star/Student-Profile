import {
  normalizeIpAddress,
  overwriteTrustedClientIpHeaders,
  TRUSTED_IP_HEADERS,
  type TrustedIpHeader,
} from "./rateLimitKeying.ts";

export function bindGatewayTrustedClientIp(
  request: Request,
  configuredHeader: string | null | undefined,
): Request {
  const trustedHeader = normalizeTrustedHeader(configuredHeader);
  if (!trustedHeader) return request;

  const clientIp = readSafeIp(request.headers.get(trustedHeader)) ||
    readRightmostForwardedIp(request.headers);
  if (!clientIp) return request;

  return new Request(request, {
    headers: overwriteTrustedClientIpHeaders(
      request.headers,
      trustedHeader,
      clientIp,
    ),
  });
}

function normalizeTrustedHeader(
  value: string | null | undefined,
): TrustedIpHeader | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "x-forwarded-for" ||
    !TRUSTED_IP_HEADERS.includes(normalized as TrustedIpHeader)
  ) {
    return null;
  }
  return normalized as TrustedIpHeader;
}

function readRightmostForwardedIp(headers: Headers): string {
  const candidates = String(headers.get("x-forwarded-for") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const value = readSafeIp(candidates[index]);
    if (value) return value;
  }
  return "";
}

function readSafeIp(value: string | null | undefined): string {
  try {
    return normalizeIpAddress(String(value || ""));
  } catch {
    return "";
  }
}
