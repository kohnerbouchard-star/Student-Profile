import type { StaffRequestApplicationContext } from "../../../shared/staffRequestApplicationContext.ts";
import {
  type StaffBootstrapProfile,
  StaffGameSessionBootstrapPersistenceError,
  type StaffGameSessionBootstrapRecord,
  type StaffGameSessionBootstrapRepository,
} from "../application/staffGameSessionBootstrap.ts";

interface QueryError {
  readonly message?: string;
}

interface QueryResponse {
  readonly data: unknown;
  readonly error: QueryError | null;
}

interface BootstrapFilterQueryBuilder extends PromiseLike<QueryResponse> {
  eq(column: string, value: unknown): BootstrapFilterQueryBuilder;
  in(
    column: string,
    values: readonly unknown[],
  ): BootstrapFilterQueryBuilder;
  order(
    column: string,
    options?: { readonly ascending?: boolean; readonly nullsFirst?: boolean },
  ): BootstrapFilterQueryBuilder;
  maybeSingle(): PromiseLike<QueryResponse>;
}

interface BootstrapTableQueryBuilder {
  select(columns: string): BootstrapFilterQueryBuilder;
}

export interface StaffGameSessionBootstrapSupabaseClient {
  from(table: string): BootstrapTableQueryBuilder;
}

export const STAFF_GAME_SESSION_DISCOVERY_COLUMNS = "id";

export const STAFF_BOOTSTRAP_PROFILE_COLUMNS = [
  "id",
  "supabase_auth_user_id",
  "email",
  "display_name",
  "created_at",
  "updated_at",
].join(",");

export const STAFF_GAME_SESSION_HYDRATION_COLUMNS = [
  "id",
  "owner_staff_user_id",
  "name",
  "status",
  "game_join_code",
  "game_join_code_status",
  "created_at",
  "updated_at",
].join(",");

export function createSupabaseStaffGameSessionBootstrapRepository(
  client: StaffGameSessionBootstrapSupabaseClient,
): StaffGameSessionBootstrapRepository {
  return {
    async discoverOwnedGameSessionIds(input) {
      try {
        requireText(input.staffUserId);
        requireVisibility(input.visibility);
        let query = client
          .from("game_sessions")
          .select(STAFF_GAME_SESSION_DISCOVERY_COLUMNS)
          .eq("owner_staff_user_id", input.staffUserId);
        if (input.visibility === "active") {
          query = query.eq("status", "active");
        }

        const response = await query.order("created_at", { ascending: false });
        if (response.error || !Array.isArray(response.data)) {
          throw new StaffGameSessionBootstrapPersistenceError();
        }
        return response.data.map(readDiscoveryId);
      } catch {
        throw new StaffGameSessionBootstrapPersistenceError();
      }
    },

    async readStaffBootstrapProfile(input) {
      try {
        requireText(input.staffUserId);
        const response = await client
          .from("staff_users")
          .select(STAFF_BOOTSTRAP_PROFILE_COLUMNS)
          .eq("id", input.staffUserId)
          .maybeSingle();
        if (response.error) {
          throw new StaffGameSessionBootstrapPersistenceError();
        }
        if (response.data === null) return null;
        return readStaffProfile(response.data);
      } catch {
        throw new StaffGameSessionBootstrapPersistenceError();
      }
    },

    async hydrateOwnedGameSessions(input) {
      try {
        requireVisibility(input.visibility);
        if (input.applicationContexts.length === 0) return [];
        const reviewed = reviewContextBatch(input.applicationContexts);

        let query = client
          .from("game_sessions")
          .select(STAFF_GAME_SESSION_HYDRATION_COLUMNS)
          .in("id", reviewed.gameSessionIds)
          .eq("owner_staff_user_id", reviewed.staffUserId);
        if (input.visibility === "active") {
          query = query.eq("status", "active");
        }

        const response = await query;
        if (response.error || !Array.isArray(response.data)) {
          throw new StaffGameSessionBootstrapPersistenceError();
        }
        return response.data.map(readGameSession);
      } catch {
        throw new StaffGameSessionBootstrapPersistenceError();
      }
    },
  };
}

function reviewContextBatch(
  contexts: readonly StaffRequestApplicationContext[],
): {
  readonly staffUserId: string;
  readonly requestId: string;
  readonly gameSessionIds: readonly string[];
} {
  const first = contexts[0];
  if (!isReviewedContext(first)) {
    throw new StaffGameSessionBootstrapPersistenceError();
  }

  const contextReferences = new Set<object>();
  const gameSessionIds = new Set<string>();
  for (const context of contexts) {
    if (
      !isReviewedContext(context) ||
      context.actor.staffUserId !== first.actor.staffUserId ||
      context.requestId !== first.requestId ||
      contextReferences.has(context) ||
      gameSessionIds.has(context.gameSessionId)
    ) {
      throw new StaffGameSessionBootstrapPersistenceError();
    }
    contextReferences.add(context);
    gameSessionIds.add(context.gameSessionId);
  }

  return {
    staffUserId: first.actor.staffUserId,
    requestId: first.requestId,
    gameSessionIds: [...gameSessionIds],
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
      isText(value.gameSessionId) &&
      value.actor.kind === "staff" &&
      isText(value.actor.staffUserId) &&
      value.role === "game_admin" &&
      ["aal1", "aal2", "unknown"].includes(value.assuranceLevel) &&
      isText(value.requestId) &&
      Array.isArray(value.permissions),
  );
}

function readDiscoveryId(value: unknown): string {
  const row = requireRecord(value);
  return requireText(row.id);
}

function readStaffProfile(value: unknown): StaffBootstrapProfile {
  const row = requireRecord(value);
  return {
    id: requireText(row.id),
    supabaseAuthUserId: nullableText(row.supabase_auth_user_id),
    email: requireText(row.email),
    displayName: requireText(row.display_name),
    createdAt: requireText(row.created_at),
    updatedAt: requireText(row.updated_at),
  };
}

function readGameSession(value: unknown): StaffGameSessionBootstrapRecord {
  const row = requireRecord(value);
  return {
    id: requireText(row.id),
    ownerStaffUserId: requireText(row.owner_staff_user_id),
    name: requireText(row.name),
    status: requireText(row.status),
    gameJoinCode: nullableText(row.game_join_code),
    gameJoinCodeStatus: requireText(row.game_join_code_status),
    createdAt: requireText(row.created_at),
    updatedAt: requireText(row.updated_at),
  };
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new StaffGameSessionBootstrapPersistenceError();
  }
  return value as Record<string, unknown>;
}

function requireText(value: unknown): string {
  if (!isText(value)) {
    throw new StaffGameSessionBootstrapPersistenceError();
  }
  return value;
}

function nullableText(value: unknown): string | null {
  if (value === null) return null;
  return requireText(value);
}

function requireVisibility(value: unknown): void {
  if (value !== "all" && value !== "active") {
    throw new StaffGameSessionBootstrapPersistenceError();
  }
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value === value.trim();
}
