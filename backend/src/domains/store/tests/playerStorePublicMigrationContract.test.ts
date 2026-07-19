declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260719150000_add_player_store_public_keys_v1.sql",
  import.meta.url,
);

Deno.test("Player Store migration adds public transaction keys and atomic wrapper", async () => {
  const source = await Deno.readTextFile(MIGRATION);
  for (const expected of [
    "public_quote_key",
    "quote_[a-f0-9]{32}",
    "public_receipt_key",
    "receipt_[a-f0-9]{32}",
    "purchase_quoted_store_item_public_v1",
    "from public.purchase_quoted_store_item(",
    "q.public_quote_key = lower(btrim(p_quote_key))",
    "p.public_receipt_key",
    "i.item_key",
    "coalesce(h.quantity_owned, 0)",
    "already_completed boolean",
  ]) {
    if (!source.includes(expected)) {
      throw new Error(`Expected migration contract fragment: ${expected}`);
    }
  }
});
