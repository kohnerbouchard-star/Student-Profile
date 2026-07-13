import {
  applyDifficultyPolicy,
  normalizeSettingsMutation,
  normalizeStoreMutation,
} from "./mutationAdapters.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("normalizes v606 store create and update payloads", async () => {
  const create = await normalizeStoreMutation(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({
        item: {
          title: "Workshop Pass",
          sku: "Workshop Pass 01",
          stock: "7",
          cost: "125",
          currency: "eco",
          visibility: "private",
        },
      }),
    }),
    "POST",
  );

  assert(create.method === "POST", "create method should remain POST");
  assert(create.body.name === "Workshop Pass", "title alias should become name");
  assert(create.body.itemKey === "workshop-pass-01", "item key should be normalized");
  assert(create.body.stockQuantity === 7, "stock alias should become an integer");
  assert(create.body.price === 125, "cost alias should become price");
  assert(create.body.currencyCode === "ECO", "currency should be uppercase");
  assert(create.body.visibility === "hidden", "private visibility should become hidden");

  const update = await normalizeStoreMutation(
    new Request("https://example.test", {
      method: "PUT",
      body: JSON.stringify({ storeItem: { itemName: "Updated", quantity: 2 } }),
    }),
    "PUT",
  );

  assert(update.method === "PATCH", "PUT should be translated to PATCH");
  assert(update.body.name === "Updated", "itemName alias should become name");
  assert(update.body.stockQuantity === 2, "quantity alias should become stockQuantity");
});

Deno.test("translates store delete into a reversible archive", async () => {
  const result = await normalizeStoreMutation(
    new Request("https://example.test", { method: "DELETE" }),
    "DELETE",
  );

  assert(result.method === "PATCH", "delete should use the supported PATCH contract");
  assert(result.body.status === "archived", "delete should archive the item");
  assert(result.body.visibility === "hidden", "archived items should be hidden");
});

Deno.test("separates standard settings from custom difficulty policy values", async () => {
  const result = await normalizeSettingsMutation(
    new Request("https://example.test", {
      method: "PATCH",
      body: JSON.stringify({
        settings: {
          difficulty: "hard",
          attendanceWindow: { start: "08:00" },
          priceMultiplier: 1.25,
          recoverySupport: 3,
        },
      }),
    }),
  );

  assert(result.gameSettings.difficultyPreset === "hard", "difficulty alias should be normalized");
  assert(result.gameSettings.attendanceWindow.start === "08:00", "attendance window should remain intact");
  assert(result.policySettings.difficulty_preset === "custom", "slider edits should select custom mode");
  assert(result.policySettings.price_modifier === 1.25, "price multiplier should map to price modifier");
  assert(result.policySettings.credit_modifier === 2, "policy modifiers should be clamped to database limits");
});

Deno.test("applies a named difficulty preset from the authoritative profile", async () => {
  const existing = {
    id: "settings-id",
    difficulty_preset: "custom",
    source: "custom",
  };
  const profile = {
    id: "profile-id",
    preset_key: "hard",
    label: "Hard",
    price_modifier: 1.18,
    event_volatility_modifier: 1.25,
    scarcity_modifier: 1.2,
    income_modifier: 0.9,
    trade_modifier: 1.18,
    credit_modifier: 1.18,
    status: "active",
  };
  let appliedPatch: Record<string, unknown> | null = null;

  const service = {
    from(table: string) {
      let mode = "select";
      let patch: Record<string, unknown> | null = null;
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        update(value: Record<string, unknown>) {
          mode = "update";
          patch = value;
          appliedPatch = value;
          return query;
        },
        async maybeSingle() {
          if (table === "game_difficulty_policy_settings" && mode === "select") {
            return { data: existing, error: null };
          }
          if (table === "difficulty_policy_profiles") {
            return { data: profile, error: null };
          }
          return { data: { ...existing, ...(patch || {}) }, error: null };
        },
      };
      return query;
    },
  };

  await applyDifficultyPolicy(service, "game-id", {
    difficulty_preset: "hard",
    source: "preset",
  });

  assert(appliedPatch?.source === "preset", "preset source should be persisted");
  assert(appliedPatch?.difficulty_policy_profile_id === "profile-id", "preset profile should be linked");
  assert(appliedPatch?.price_modifier === 1.18, "preset modifiers should come from the profile");
  assert(appliedPatch?.custom_label === null, "preset mode should clear the custom label");
});
