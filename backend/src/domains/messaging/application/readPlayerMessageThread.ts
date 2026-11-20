import type { PlayerRequestScope } from "../../players/index.ts";
import type { RawThread } from "../contracts/playerMessageThreadRead.ts";

export interface PlayerMessageThreadReadQuery {
  readonly threadId: string;
  readonly messageLimit: number;
}

export interface PlayerMessageThreadReadRepository {
  readThread(
    scope: PlayerRequestScope,
    query: PlayerMessageThreadReadQuery,
  ): PromiseLike<{
    readonly data: RawThread | null;
    readonly error: { readonly code?: string; readonly message: string } | null;
  }>;
}

export function readPlayerMessageThread(
  scope: PlayerRequestScope,
  query: PlayerMessageThreadReadQuery,
  repository: PlayerMessageThreadReadRepository,
) {
  return repository.readThread(scope, query);
}
