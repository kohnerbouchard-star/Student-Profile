import type { PlayerRequestScope } from "../../players/index.ts";

export interface CreatePlayerMessageThreadCommand {
  readonly recipientPlayerId: string;
  readonly title: string;
  readonly body: string;
  readonly idempotencyKey: string;
}

export interface PlayerMessageThreadRepository {
  createThread(
    scope: PlayerRequestScope,
    command: CreatePlayerMessageThreadCommand,
  ): PromiseLike<{
    readonly data: readonly unknown[] | null;
    readonly error: { readonly code?: string; readonly message: string } | null;
  }>;
}

export function createPlayerMessageThread(
  scope: PlayerRequestScope,
  command: CreatePlayerMessageThreadCommand,
  repository: PlayerMessageThreadRepository,
) {
  // The same atomic command owns both the thread and its initial message/replay receipt.
  return repository.createThread(scope, command);
}
