import type { PlayerRequestScope } from "../../players/index.ts";

export interface PlayerMessagePolicyReadRepository {
  readPolicy(scope: PlayerRequestScope): PromiseLike<{
    readonly data: Record<string, unknown> | null;
    readonly error: { readonly code?: string; readonly message: string } | null;
  }>;
}

export function readPlayerMessagePolicy(
  scope: PlayerRequestScope,
  repository: PlayerMessagePolicyReadRepository,
) {
  // Preserve the authenticated scope; only the persistence adapter projects IDs.
  return repository.readPolicy(scope);
}
