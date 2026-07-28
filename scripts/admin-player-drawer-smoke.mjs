import { writeFileSync } from "node:fs";
import {
  BASE_URL,
  createSpecializedQualityHarness,
} from "./admin-specialized-quality-fixture.mjs";

const PLAYER_ID = "00000000-0000-4000-8000-000000000703";
const TAB_LABELS = ["Overview", "Bank Accounts", "Assets", "Liabilities", "Inventory", "Logs"];
const TAB_KEYS = ["overview", "bank", "assets", "liabilities", "inventory", "logs"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const player = {
  id: PLAYER_ID,
  playerId: PLAYER_ID,
  displayName: "Authoritative Drawer Player",
  name: "Authoritative Drawer Player",
  rosterLabel: "DRAWER-01",
  playerIdentifier: "RFID:DRAWER-01",
  status: "active",
  sessionStatus: "offline",
  countryCode: "NORTHREACH",
  countryName: "Northreach",
  location: "Northreach",
  currencyCode: "NRC",
  cashBalance: 1250,
  balance: 1250,
  netWorth: 1980,
  balances: [
    { accountType: "cash", balance: 1250, currencyCode: "NRC" },
    { accountType: "savings", balance: 300, currencyCode: "NRC" },
  ],
  stockMarketValue: 400,
  stockPositions: [{
    stockAssetId: "00000000-0000-4000-8000-000000000704",
    ticker: "NOVA",
    companyName: "Novaria Logistics",
    quantity: 4,
    currentPrice: 100,
    marketValue: 400,
  }],
  inventoryMarketValue: 30,
  inventoryPositions: [{
    storeItemId: "00000000-0000-4000-8000-000000000705",
    itemName: "Market Intel Token",
    quantityOwned: 1,
    quantityReserved: 0,
    availableQuantity: 1,
    unitValue: 30,
    marketValue: 30,
  }],
  overallScore: null,
};

const harness = await createSpecializedQualityHarness("admin-player-drawer-v606", {
  model: {
    players: [player],
    roster: [player],
    attendanceSummary: {
      presentCount: 0,
      lateCount: 0,
      absentCount: 0,
      activePlayerCount: 1,
      rewardsIssuedCount: 0,
      rewardsIssuedTotal: 0,
    },
    attendanceCounts: { present: 0, late: 0, absent: 0, total: 1 },
    dashboard: {
      activePlayerCount: 1,
      totalPlayers: 1,
      onlinePlayerCount: 0,
      attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 0 },
      leaderboard: [],
      recentActivity: [],
      marketStatus: "open",
    },
  },
});
const { page, errors, dir } = harness;
let phase = "initializing";

await page.addInitScript(() => {
  window.__adminKeyboardPointerEvents = [];
  for (const type of ["pointerdown", "mousedown", "touchstart"]) {
    window.addEventListener(type, (event) => {
      window.__adminKeyboardPointerEvents.push({
        type: event.type,
        target: event.target?.tagName || "",
      });
    }, true);
  }
});

async function saveDiagnostics(name, extra = {}) {
  writeFileSync(`${dir}/${name}.json`, JSON.stringify({ phase, errors, ...extra }, null, 2));
  writeFileSync(`${dir}/${name}.html`, await page.content());
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

async function keyboardActivate(locator, key = "Enter") {
  await locator.waitFor({ state: "visible", timeout: 8000 });
  await locator.focus();
  assert(
    await locator.evaluate((node) => document.activeElement === node),
    `Keyboard target did not receive focus: ${await locator.textContent()}`,
  );
  await page.keyboard.press(key);
}

try {
  phase = "opening admin shell";
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });

  phase = "opening Players section";
  await keyboardActivate(page.locator('[data-admin-section="Players"]').first(), "Enter");
  const playerToggle = page.locator(
    `[data-admin-terminal-action="select-player-panel"][data-player-id="${PLAYER_ID}"]`,
  ).first();
  await keyboardActivate(playerToggle, "Enter");

  phase = "verifying original drawer shell";
  const drawer = page.locator("[data-admin-terminal-player-drawer]").first();
  await drawer.waitFor({ state: "visible", timeout: 8000 });
  assert(
    await drawer.getAttribute("data-admin-player-drawer-authoritative") !== null,
    "Player drawer is not marked as authoritative-data only.",
  );
  assert(
    await page.locator(".admin-terminal-player-real-data-v604").count() === 0,
    "Flat backend player record is still visible.",
  );

  const labels = await drawer.locator("[data-player-drawer-tab]").allTextContents();
  assert(
    JSON.stringify(labels.map((value) => value.trim())) === JSON.stringify(TAB_LABELS),
    `Player drawer tabs drifted: ${JSON.stringify(labels)}.`,
  );
  assert(!(await drawer.textContent()).includes(PLAYER_ID), "Player drawer exposed the backend UUID.");

  const firstTab = drawer.locator('[data-player-drawer-tab="overview"]');
  await firstTab.focus();
  assert(
    await firstTab.evaluate((node) => document.activeElement === node),
    "Overview drawer tab did not receive focus.",
  );

  for (let index = 0; index < TAB_KEYS.length; index += 1) {
    const key = TAB_KEYS[index];
    phase = `opening ${key} drawer tab`;
    const button = drawer.locator(`[data-player-drawer-tab="${key}"]`);
    assert(await button.evaluate((node) => document.activeElement === node), `${key} tab was not focused.`);
    assert(await button.getAttribute("aria-selected") === "true", `${key} tab was not selected.`);
    const panel = drawer.locator(`[data-player-drawer-panel="${key}"]`);
    await panel.waitFor({ state: "visible", timeout: 5000 });
    assert(
      await drawer.locator("[data-player-drawer-panel]:visible").count() === 1,
      `${key} tab left multiple panels visible.`,
    );
    if (index < TAB_KEYS.length - 1) await page.keyboard.press("ArrowRight");
  }

  const keyboardEvidence = await page.evaluate(() => ({
    modality: document.documentElement.getAttribute("data-admin-input-modality"),
    pointerEvents: window.__adminKeyboardPointerEvents || [],
  }));
  assert(keyboardEvidence.modality === "keyboard", "Player drawer lost keyboard modality.");
  assert(
    keyboardEvidence.pointerEvents.length === 0,
    `Player drawer emitted pointer input: ${JSON.stringify(keyboardEvidence.pointerEvents)}.`,
  );
  assert(errors.length === 0, errors[0] || "Unexpected browser error.");
  phase = "passed";
  await saveDiagnostics("admin-player-drawer-v606", { tabs: labels, keyboardEvidence });
  await harness.finish({ tabs: labels, keyboardEvidence });
  console.log("Authoritative player data renders and all six drawer tabs operate by keyboard.");
} catch (error) {
  await saveDiagnostics("admin-player-drawer-v606-failure", {
    failure: error.stack || error.message || String(error),
  });
  await harness.finish({ failure: error.stack || error.message || String(error) });
  throw error;
}
