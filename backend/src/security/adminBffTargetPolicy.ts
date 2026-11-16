import type { HostedEnvironment } from "./adminBffOidcVerification.ts";

const PRODUCTION_PROJECT_REF = "cgiukdjwicykrmtkhudh";

const STAGING_PROJECT_REF = "eecvbssdvarfcykcfrny";

export type DeploymentEnvironment = HostedEnvironment | "local";

export function canonicalAdminBffTargetUrl(
  requestUrlValue: string,
  supabaseUrlValue: string,
): string {
  const requestUrl = new URL(requestUrlValue);
  const supabaseUrl = new URL(supabaseUrlValue);
  const prefixes = [
    "/functions/v1/web-session-api",
    "/web-session-api",
  ] as const;
  const prefix = prefixes.find((candidate) =>
    requestUrl.pathname.startsWith(candidate)
  );
  if (!prefix) throw new Error("invalid Admin BFF path");
  const suffix = requestUrl.pathname.slice(prefix.length);
  if (
    !suffix.startsWith("/") ||
    suffix.includes("\\") ||
    suffix.split("/").includes("..")
  ) throw new Error("invalid Admin BFF path");
  return `${supabaseUrl.origin}/functions/v1/web-session-api${suffix}${requestUrl.search}`;
}

export function expectedDeploymentEnvironment(value: string): DeploymentEnvironment | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
    ["http:", "https:"].includes(url.protocol)
  ) return "local";
  if (url.protocol === "http:" && url.hostname === "kong") return "local";
  if (url.protocol !== "https:") return null;
  if (url.hostname === `${PRODUCTION_PROJECT_REF}.supabase.co`) return "production";
  if (url.hostname === `${STAGING_PROJECT_REF}.supabase.co`) return "preview";
  return null;
}

export function isLocalRequest(request: Request): boolean {
  try {
    const target = new URL(request.url);
    const origin = new URL(String(request.headers.get("origin") || ""));
    return ["localhost", "127.0.0.1", "kong"].includes(target.hostname) &&
      ["localhost", "127.0.0.1"].includes(origin.hostname) &&
      origin.protocol === "http:";
  } catch {
    return false;
  }
}
