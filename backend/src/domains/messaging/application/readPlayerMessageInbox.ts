import type { PlayerRequestScope } from "../../players/index.ts";
import type { RawInbox } from "../contracts/playerMessageInboxRead.ts";

export interface PlayerMessageInboxReadQuery {
  readonly threadLimit: number;
  readonly messageLimit: number;
  readonly query: string | null;
  readonly beforeUpdatedAt: string | null;
  readonly beforeThreadId: string | null;
}

export interface PlayerMessageInboxReadRepository {
  readInbox(
    scope: PlayerRequestScope,
    query: PlayerMessageInboxReadQuery,
  ): PromiseLike<{
    readonly data: RawInbox | null;
    readonly error: { readonly code?: string; readonly message: string } | null;
  }>;
}

export function readPlayerMessageInbox(
  scope: PlayerRequestScope,
  query: PlayerMessageInboxReadQuery,
  repository: PlayerMessageInboxReadRepository,
) {
  return repository.readInbox(scope, query);
}
