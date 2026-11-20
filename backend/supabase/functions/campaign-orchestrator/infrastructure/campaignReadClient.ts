/** Preserve the Campaign worker's existing single-attempt reads. */
export function createCampaignReadClient<Read, Rpc>(client: {
  from(table: string): {
    select(columns: string): { retry(enabled: false): Read };
  };
  rpc(name: string, args: Readonly<Record<string, unknown>>): Rpc;
}) {
  return {
    from(table: string) {
      const relation = client.from(table);
      return {
        select(columns: string): Read {
          return relation.select(columns).retry(false);
        },
      };
    },
    rpc(name: string, args: Readonly<Record<string, unknown>>): Rpc {
      return client.rpc(name, args);
    },
  };
}
