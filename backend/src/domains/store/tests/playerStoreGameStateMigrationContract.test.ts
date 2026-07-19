declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260719170000_gate_public_store_purchase_by_game_state_v1.sql",
  import.meta.url,
);

// Completed replay detection must remain ahead of the game-state lock so callers can
// recover a committed receipt after pause or archival without creating a new write.
Deno.test("public Store settlement gates new writes while preserving completed replay", async () => {
  const source = await Deno.readTextFile(MIGRATION);

  for (const expected of [
    "create or replace function public.purchase_quoted_store_item_public_v1",
    "select exists (",
    "p.status = 'COMPLETED'",
    "if not v_replay then",
    "from public.game_sessions game",
    "for share",
    "v_game_status = 'disabled'",
    "GAME_SESSION_DISABLED",
    "v_game_status = 'archived'",
    "GAME_SESSION_ARCHIVED",
    "v_game_status <> 'active'",
    "GAME_SESSION_NOT_ACTIVE",
    "from public.purchase_quoted_store_item(",
    "from public, anon, authenticated",
    "to service_role",
  ]) {
    assertIncludes(source, expected);
  }

  assertOrdered(source, [
    "select exists (",
    "if not v_replay then",
    "from public.game_sessions game",
    "from public.purchase_quoted_store_item(",
  ]);
});

function assertIncludes(source: string, expected: string): void {
  if (!source.includes(expected)) {
    throw new Error(`Expected Store game-state migration to include: ${expected}`);
  }
}

function assertOrdered(source: string, fragments: readonly string[]): void {
  let prior = -1;
  for (const fragment of fragments) {
    const current = source.indexOf(fragment);
    if (current < 0 || current <= prior) {
      throw new Error(`Expected ordered Store migration fragment: ${fragment}`);
    }
    prior = current;
  }
}
