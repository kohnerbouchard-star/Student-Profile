import type { StaffIdentity } from "../../../auth/types.ts";
import type { LicensingActivationRouteContext } from "./activationContract.ts";

export interface LicensingActivationRequestMetadata {
  readonly requestId?: string | null;
  readonly source?: string | null;
}

export function buildLicensingActivationRouteContext(
  staffIdentity: StaffIdentity,
  metadata: LicensingActivationRequestMetadata = {},
): LicensingActivationRouteContext {
  return {
    staffUserId: staffIdentity.staffUserId,
    requestId: normalizeOptionalText(metadata.requestId),
    source: normalizeOptionalText(metadata.source),
  };
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue || null;
}
