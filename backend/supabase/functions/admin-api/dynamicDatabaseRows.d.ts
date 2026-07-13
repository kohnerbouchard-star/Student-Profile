/**
 * The admin Edge adapter uses an ungenerated Supabase client, so isolated
 * `new Map(query.data.map(...))` expressions otherwise infer `unknown` values.
 * Domain read models use explicit row types; this fallback is limited to this
 * Edge Function's compiler configuration.
 */
interface MapConstructor {
  new(
    entries?: readonly (readonly [any, any])[] | null,
  ): Map<any, Record<string, any>>;
}
