export type PlayerBankingPublicRoute = { readonly kind: "banking" };

export function readPlayerBankingPublicRoutePath(pathname: string): PlayerBankingPublicRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const playersIndex = segments.lastIndexOf("players");
  if (playersIndex < 0 || segments[playersIndex + 1] !== "me") return null;
  if (segments[playersIndex + 2] !== "ledger") return null;
  if (playersIndex + 3 !== segments.length) return null;
  return { kind: "banking" };
}
