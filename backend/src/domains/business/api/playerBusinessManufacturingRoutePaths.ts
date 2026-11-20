const publicKeyPattern = /^[a-z0-9][a-z0-9_-]{4,159}$/;

const decodePublicKey = (value: string): string | null => {
  try {
    const decoded = decodeURIComponent(value).trim().toLowerCase();
    return publicKeyPattern.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
};

export type PlayerBusinessManufacturingCollectionMatch = {
  businessKey: string;
};

export type PlayerBusinessManufacturingCancellationMatch = {
  businessKey: string;
  jobKey: string;
};

export const matchPlayerBusinessManufacturingCollectionPath = (
  pathname: string,
): PlayerBusinessManufacturingCollectionMatch | null => {
  const match = /^\/players\/me\/businesses\/([^/]+)\/manufacturing\/jobs\/?$/.exec(
    pathname,
  );
  if (!match) {
    return null;
  }
  const businessKey = decodePublicKey(match[1] ?? "");
  return businessKey ? { businessKey } : null;
};

export const matchPlayerBusinessManufacturingCancellationPath = (
  pathname: string,
): PlayerBusinessManufacturingCancellationMatch | null => {
  const match = /^\/players\/me\/businesses\/([^/]+)\/manufacturing\/jobs\/([^/]+)\/cancel\/?$/.exec(
    pathname,
  );
  if (!match) {
    return null;
  }
  const businessKey = decodePublicKey(match[1] ?? "");
  const jobKey = decodePublicKey(match[2] ?? "");
  if (!businessKey || !jobKey || !jobKey.startsWith("mfg_")) {
    return null;
  }
  return { businessKey, jobKey };
};
