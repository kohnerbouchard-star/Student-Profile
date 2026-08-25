import type { StaffRequestApplicationContext } from "../../../shared/staffRequestApplicationContext.ts";

export type StaffGameSessionVisibility = "all" | "active";

export interface StaffBootstrapProfile {
  readonly id: string;
  readonly supabaseAuthUserId: string | null;
  readonly email: string;
  readonly displayName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StaffGameSessionBootstrapRecord {
  readonly id: string;
  readonly ownerStaffUserId: string;
  readonly name: string;
  readonly status: string;
  readonly gameJoinCode: string | null;
  readonly gameJoinCodeStatus: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StaffGameSessionBootstrapEntry<
  TContext extends StaffRequestApplicationContext =
    StaffRequestApplicationContext,
> {
  readonly applicationContext: TContext;
  readonly gameSession: StaffGameSessionBootstrapRecord;
}

export interface StaffGameSessionBootstrapRepository {
  discoverOwnedGameSessionIds(input: {
    readonly staffUserId: string;
    readonly visibility: StaffGameSessionVisibility;
  }): Promise<readonly string[]>;
  readStaffBootstrapProfile(input: {
    readonly staffUserId: string;
  }): Promise<StaffBootstrapProfile | null>;
  hydrateOwnedGameSessions(input: {
    readonly applicationContexts: readonly StaffRequestApplicationContext[];
    readonly visibility: StaffGameSessionVisibility;
  }): Promise<readonly StaffGameSessionBootstrapRecord[]>;
}

export class StaffGameSessionBootstrapError extends Error {
  constructor() {
    super("Staff game-session bootstrap failed.");
    this.name = "StaffGameSessionBootstrapError";
  }
}

export class StaffGameSessionBootstrapPersistenceError extends Error {
  constructor() {
    super("Staff game-session bootstrap persistence failed.");
    this.name = "StaffGameSessionBootstrapPersistenceError";
  }
}

export async function discoverStaffGameSessionIds(
  repository: StaffGameSessionBootstrapRepository,
  input: {
    readonly staffUserId: string;
    readonly visibility: StaffGameSessionVisibility;
  },
): Promise<readonly string[]> {
  try {
    if (!isRequiredText(input.staffUserId) || !isVisibility(input.visibility)) {
      throw new StaffGameSessionBootstrapError();
    }

    const gameSessionIds = await repository.discoverOwnedGameSessionIds(input);
    if (!isDistinctRequiredTextArray(gameSessionIds)) {
      throw new StaffGameSessionBootstrapError();
    }
    return Object.freeze([...gameSessionIds]);
  } catch {
    throw new StaffGameSessionBootstrapError();
  }
}

export async function readStaffBootstrapProfile(
  repository: StaffGameSessionBootstrapRepository,
  input: { readonly staffUserId: string },
): Promise<StaffBootstrapProfile> {
  try {
    if (!isRequiredText(input.staffUserId)) {
      throw new StaffGameSessionBootstrapError();
    }

    const profile = await repository.readStaffBootstrapProfile(input);
    if (
      !isStaffBootstrapProfile(profile) ||
      profile.id !== input.staffUserId
    ) {
      throw new StaffGameSessionBootstrapError();
    }
    return profile;
  } catch {
    throw new StaffGameSessionBootstrapError();
  }
}

export async function hydrateStaffGameSessionBootstrap<
  TContext extends StaffRequestApplicationContext,
>(
  repository: StaffGameSessionBootstrapRepository,
  input: {
    readonly applicationContexts: readonly TContext[];
    readonly visibility: StaffGameSessionVisibility;
  },
): Promise<readonly StaffGameSessionBootstrapEntry<TContext>[]> {
  try {
    if (!isVisibility(input.visibility)) {
      throw new StaffGameSessionBootstrapError();
    }
    if (input.applicationContexts.length === 0) {
      return Object.freeze([]);
    }

    const reviewed = reviewApplicationContexts(input.applicationContexts);
    const rows = await repository.hydrateOwnedGameSessions(input);
    if (
      !Array.isArray(rows) ||
      rows.length !== input.applicationContexts.length
    ) {
      throw new StaffGameSessionBootstrapError();
    }

    const rowsById = new Map<string, StaffGameSessionBootstrapRecord>();
    for (const row of rows) {
      if (
        !isStaffGameSessionBootstrapRecord(row) ||
        row.ownerStaffUserId !== reviewed.staffUserId ||
        (input.visibility === "active" && row.status !== "active") ||
        !reviewed.gameSessionIds.has(row.id) ||
        rowsById.has(row.id)
      ) {
        throw new StaffGameSessionBootstrapError();
      }
      rowsById.set(row.id, row);
    }

    if (rowsById.size !== reviewed.gameSessionIds.size) {
      throw new StaffGameSessionBootstrapError();
    }

    return Object.freeze(input.applicationContexts.map((applicationContext) => {
      const gameSession = rowsById.get(applicationContext.gameSessionId);
      if (!gameSession) throw new StaffGameSessionBootstrapError();
      return Object.freeze({ applicationContext, gameSession });
    }));
  } catch {
    throw new StaffGameSessionBootstrapError();
  }
}

function reviewApplicationContexts<
  TContext extends StaffRequestApplicationContext,
>(
  contexts: readonly TContext[],
): {
  readonly staffUserId: string;
  readonly requestId: string;
  readonly gameSessionIds: ReadonlySet<string>;
} {
  const first = contexts[0];
  if (!isReviewedContext(first)) throw new StaffGameSessionBootstrapError();

  const references = new Set<object>();
  const gameSessionIds = new Set<string>();
  for (const context of contexts) {
    if (
      !isReviewedContext(context) ||
      context.actor.staffUserId !== first.actor.staffUserId ||
      context.requestId !== first.requestId ||
      references.has(context) ||
      gameSessionIds.has(context.gameSessionId)
    ) {
      throw new StaffGameSessionBootstrapError();
    }
    references.add(context);
    gameSessionIds.add(context.gameSessionId);
  }

  return {
    staffUserId: first.actor.staffUserId,
    requestId: first.requestId,
    gameSessionIds,
  };
}

function isReviewedContext(
  value: StaffRequestApplicationContext | undefined,
): value is StaffRequestApplicationContext {
  return Boolean(
    value &&
      Object.isFrozen(value) &&
      Object.isFrozen(value.actor) &&
      Object.isFrozen(value.permissions) &&
      isRequiredText(value.gameSessionId) &&
      value.actor.kind === "staff" &&
      isRequiredText(value.actor.staffUserId) &&
      value.role === "game_admin" &&
      ["aal1", "aal2", "unknown"].includes(value.assuranceLevel) &&
      isRequiredText(value.requestId) &&
      Array.isArray(value.permissions),
  );
}

function isStaffBootstrapProfile(
  value: StaffBootstrapProfile | null,
): value is StaffBootstrapProfile {
  return Boolean(
    value &&
      isRequiredText(value.id) &&
      (value.supabaseAuthUserId === null ||
        isRequiredText(value.supabaseAuthUserId)) &&
      isRequiredText(value.email) &&
      isRequiredText(value.displayName) &&
      isRequiredText(value.createdAt) &&
      isRequiredText(value.updatedAt),
  );
}

function isStaffGameSessionBootstrapRecord(
  value: StaffGameSessionBootstrapRecord,
): value is StaffGameSessionBootstrapRecord {
  return Boolean(
    value &&
      isRequiredText(value.id) &&
      isRequiredText(value.ownerStaffUserId) &&
      isRequiredText(value.name) &&
      isRequiredText(value.status) &&
      (value.gameJoinCode === null || typeof value.gameJoinCode === "string") &&
      isRequiredText(value.gameJoinCodeStatus) &&
      isRequiredText(value.createdAt) &&
      isRequiredText(value.updatedAt),
  );
}

function isDistinctRequiredTextArray(
  value: readonly string[],
): value is readonly string[] {
  return Array.isArray(value) &&
    value.every(isRequiredText) &&
    new Set(value).size === value.length;
}

function isRequiredText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value === value.trim();
}

function isVisibility(value: unknown): value is StaffGameSessionVisibility {
  return value === "all" || value === "active";
}
