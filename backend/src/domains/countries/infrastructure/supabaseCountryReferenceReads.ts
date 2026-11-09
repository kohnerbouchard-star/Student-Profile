type Row = Record<string, unknown>;
interface Response<T> {
  readonly data: T | null;
  readonly error: { readonly message: string; readonly code?: string } | null;
}
interface ReferenceFilter extends PromiseLike<Response<readonly Row[]>> {
  eq(column: string, value: unknown): ReferenceFilter;
  in(column: string, values: readonly unknown[]): ReferenceFilter;
  order(column: string, options?: { readonly ascending?: boolean }): ReferenceFilter;
  limit(count: number): ReferenceFilter;
  maybeSingle(): PromiseLike<Response<Row>>;
}
interface CountryReferenceClient {
  from(table: "country_profiles"): { select(columns: string): ReferenceFilter };
}

const PROFILE_SELECT = [
  "id",
  "country_code",
  "country_name",
  "capital_name",
  "currency_code",
  "status",
  "metadata",
].join(",");

// Country profiles are shared references. Game snapshots determine which IDs
// are visible; this reader never owns mutable game or Player projections.
export function readVisibleCountryReferences(
  client: CountryReferenceClient,
  profileIds: readonly string[],
  limit: number,
): PromiseLike<Response<readonly Row[]>> {
  return client.from("country_profiles")
    .select(PROFILE_SELECT)
    .eq("status", "active")
    .in("id", profileIds)
    .order("country_name", { ascending: true })
    .limit(limit);
}

export function readVisibleCountryReference(
  client: CountryReferenceClient,
  countryCode: string,
): PromiseLike<Response<Row>> {
  return client.from("country_profiles")
    .select(PROFILE_SELECT)
    .eq("status", "active")
    .eq("country_code", countryCode)
    .limit(1)
    .maybeSingle();
}
