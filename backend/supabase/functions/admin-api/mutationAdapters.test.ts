import {
  applyDifficultyPolicy,
  normalizeContractCreate,
  normalizeContractReview,
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

Deno.test("normalizes the v606 contract composer payload", async () => {
  const result = await normalizeContractCreate(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({
        assignment: {
          title: "Market analysis",
          instructions: "Submit the completed analysis.",
          locations: ["Asteron", "Northreach"],
          cashRewardAmount: "250",
          rewardCurrencyCode: "eco",
          itemRewards: [{ itemUuid: "11111111-1111-4111-8111-111111111111", qty: 2 }],
          materials: [{ type: "link", url: "https://example.test/material" }],
          submissionRequirements: [{ type: "file", label: "Analysis" }],
          scheduledAt: "2026-07-14T09:00:00.000Z",
          deadline: "2026-07-21T09:00:00.000Z",
        },
      }),
    }),
  );

  assert(result.title === "Market analysis", "contract title should be preserved");
  assert(result.description === "Submit the completed analysis.", "instructions should provide the required description fallback");
  assert(result.status === "scheduled", "scheduled contracts should use scheduled status");
  assert(result.visibility === "targeted", "country targeting should select targeted visibility");
  assert(result.targetingPayload.countryCodes.length === 2, "locations should become country codes");
  assert(result.rewardPayload.cash.amount === 250, "cash reward should be canonicalized");
  assert(result.rewardPayload.cash.currencyCode === "ECO", "cash currency should be uppercase");
  assert(result.rewardPayload.items[0].storeItemId === "11111111-1111-4111-8111-111111111111", "item UUID should become storeItemId");
  assert(result.rewardPayload.items[0].quantity === 2, "item quantity should be preserved");
  assert(result.metadata.materials.length === 1, "materials should be placed in metadata");
  assert(result.metadata.submissionRequirements.length === 1, "student work requirements should be placed in metadata");
});

Deno.test("normalizes contract review decisions", async () => {
  const result = await normalizeContractReview(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ decision: "approved", feedback: "Complete." }),
    }),
  );

  assert(result.action === "approve", "approved should map to the backend approve action");
  assert(result.resultPayload.feedback === "Complete.", "review feedback should be retained");
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

Deno.test("initializes a missing custom difficulty policy from the saved preset", async () => {
  const profile = {
    id: "profile-moderate",
    preset_key: "moderate",
    label: "Moderate",
    price_modifier: 1.08,
    event_volatility_modifier: 1.1,
    scarcity_modifier: 1.08,
    income_modifier: 0.95,
    trade_modifier: 1.08,
    credit_modifier: 1.08,
    status: "active",
  };
  let inserted: Record<string, unknown> | null = null;

  const service = {
    from(table: string) {
      let mode = "select";
      let payload: Record<string, unknown> | null = null;
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        insert(value: Record<string, unknown>) {
          mode = "insert";
          payload = value;
          inserted = value;
          return query;
        },
        async maybeSingle() {
          if (table === "game_difficulty_policy_settings" && mode === "select") {
            return { data: null, error: null };
          }
          if (table === "game_settings") {
            return { data: { difficulty_preset: "moderate" }, error: null };
          }
          if (table === "difficulty_policy_profiles") {
            return { data: profile, error: null };
          }
          return { data: { id: "new-policy", ...(payload || {}) }, error: null };
        },
      };
      return query;
    },
  };

  const result = await applyDifficultyPolicy(service, "game-id", {
    source: "custom",
    custom_label: "Income only",
    income_modifier: 0.75,
  });

  assert(inserted?.game_session_id === "game-id", "missing policy should be inserted for the game");
  assert(inserted?.difficulty_preset === "custom", "custom changes should create custom policy mode");
  assert(inserted?.income_modifier === 0.75, "edited modifier should be preserved");
  assert(inserted?.price_modifier === 1.08, "unedited price modifier should come from the saved preset");
  assert(inserted?.event_volatility_modifier === 1.1, "unedited volatility should come from the saved preset");
  assert(inserted?.metadata && Object.keys(inserted.metadata as Record<string, unknown>).length === 0, "new policy metadata should be initialized");
  assert(result.id === "new-policy", "inserted policy should be returned");
});
