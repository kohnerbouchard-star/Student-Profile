export const OPTIONAL_STORY_EVENT_OVERRIDE_TABLE =
  "game_session_story_event_overrides" as const;

const OPTIONAL_SCHEMA_MISSING_CODES = new Set(["42P01", "PGRST205"]);

interface SupabaseLikeClient {
  from(tableName: string): unknown;
}

interface SupabaseLikeResponse {
  readonly data?: unknown;
  readonly error?: unknown;
  readonly [key: string]: unknown;
}

export interface OptionalStoryEventOverrideReadClient {
  from(tableName: string): unknown;
}

export function withOptionalStoryEventOverrideReads<TClient extends SupabaseLikeClient>(
  client: TClient,
): OptionalStoryEventOverrideReadClient {
  return {
    from(tableName: string): unknown {
      const builder = client.from(tableName);

      return tableName === OPTIONAL_STORY_EVENT_OVERRIDE_TABLE
        ? wrapOptionalBuilder(builder)
        : builder;
    },
  };
}

export function isOptionalStoryEventOverrideMissingError(
  error: unknown,
): boolean {
  if (!isRecord(error)) {
    return false;
  }

  const code = typeof error.code === "string" ? error.code : "";
  return OPTIONAL_SCHEMA_MISSING_CODES.has(code);
}

function wrapOptionalBuilder(builder: unknown): unknown {
  if (
    builder === null ||
    (typeof builder !== "object" && typeof builder !== "function")
  ) {
    return builder;
  }

  return new Proxy(builder as object, {
    get(target, property): unknown {
      const value = Reflect.get(target, property, target);

      if (property === "then") {
        if (typeof value !== "function") {
          return value;
        }

        return (
          onFulfilled?: (response: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) =>
          value.call(
            target,
            (response: unknown) => {
              const normalized = normalizeOptionalResponse(response);
              return typeof onFulfilled === "function"
                ? onFulfilled(normalized)
                : normalized;
            },
            onRejected,
          );
      }

      if (typeof value !== "function") {
        return value;
      }

      return (...args: unknown[]) =>
        wrapOptionalBuilder(value.apply(target, args));
    },
  });
}

function normalizeOptionalResponse(response: unknown): unknown {
  if (!isRecord(response)) {
    return response;
  }

  const typedResponse = response as SupabaseLikeResponse;
  if (!isOptionalStoryEventOverrideMissingError(typedResponse.error)) {
    return response;
  }

  return {
    ...typedResponse,
    data: [],
    error: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
