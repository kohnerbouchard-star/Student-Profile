import { writeFileSync } from "node:fs";
import {
  BASE_URL,
  createSpecializedQualityHarness,
  GAME_ID,
} from "./admin-specialized-quality-fixture.mjs";

const PLAYER_UUID = "00000000-0000-4000-8000-000000000203";
const CREATE_IDENTIFIER = "RFID:CREATE-203";
const CREATE_ACCESS_CODE = "CREATE-8246";
const UPDATE_IDENTIFIER = "RFID:UPDATED-203";
const UPDATE_ACCESS_CODE = "UPDATED-9357";
const ID_ONLY_IDENTIFIER = "RFID:UPDATED-204";

function flattenedBody(value) {
  const body = value && typeof value === "object" ? value : {};
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
  return { ...body, ...payload };
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const existingPlayer = {
  id: PLAYER_UUID,
  playerId: PLAYER_UUID,
  displayName: "Existing RFID Player",
  name: "Existing RFID Player",
  rosterLabel: "GRADE-10-01",
  playerIdentifier: "RFID:OLD-203",
  status: "active",
  countryCode: "NORTHREACH",
  countryName: "Northreach",
  cashBalance: 0,
  netWorth: 0,
  currencyCode: "NRC",
};

const harness = await createSpecializedQualityHarness("admin-player-identity", {
  model: {
    players: [existingPlayer],
    roster: [existingPlayer],
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
  handleProxy: ({ method, path, parsedBody }) => {
    const payload = flattenedBody(parsedBody);
    if (method === "POST" && path.endsWith(`/games/${GAME_ID}/players`)) {
      return {
        status: 201,
        body: {
          ok: true,
          player: {
            id: "00000000-0000-4000-8000-000000000204",
            displayName: payload.displayName,
            rosterLabel: payload.rosterLabel,
            playerIdentifier: payload.playerIdentifier,
            status: "active",
          },
          accessCode: {
            studentCode: payload.accessCode,
            status: "active",
            createdAt: new Date().toISOString(),
          },
        },
      };
    }
    if (method === "PATCH" && path.endsWith(`/games/${GAME_ID}/players/${PLAYER_UUID}/settings`)) {
      return { body: { ok: true, data: { saved: true, settings: parsedBody?.settings || {} } } };
    }
    if (method === "POST" && path.endsWith(`/games/${GAME_ID}/players/${PLAYER_UUID}/access-code/reset`)) {
      return {
        body: {
          ok: true,
          player: {
            id: PLAYER_UUID,
            displayName: existingPlayer.displayName,
            rosterLabel: existingPlayer.rosterLabel,
            playerIdentifier: payload.playerIdentifier,
            status: "active",
          },
          accessCode: payload.accessCode
            ? { studentCode: payload.accessCode, status: "active", createdAt: new Date().toISOString() }
            : { studentCode: null, status: "unchanged", createdAt: null },
        },
      };
    }
    return null;
  },
});
const { page, errors, writes, dir } = harness;
const consoleMessages = [];
let phase = "initializing";
page.on("console", (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));

async function closeCreatedPlayerConfirmation() {
  const confirmation = page.locator("[data-admin-player-created-confirmation]");
  await confirmation.waitFor({ state: "visible", timeout: 8000 });
  await confirmation.locator("[data-admin-player-created-done]").click();
  await confirmation.waitFor({ state: "detached", timeout: 5000 });
}

async function saveDiagnostics(name, extra = {}) {
  writeFileSync(`${dir}/${name}.json`, JSON.stringify({
    phase,
    writes,
    errors,
    consoleMessages,
    ...extra,
  }, null, 2));
  writeFileSync(`${dir}/${name}.html`, await page.content());
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

const mappedWrites = () => writes.map((write) => ({
  ...write,
  pathname: write.path,
  payload: flattenedBody(write.parsedBody),
  body: write.parsedBody,
}));

try {
  phase = "opening admin shell";
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });

  phase = "rejecting separate identity interfaces";
  assert(
    await page.locator("[data-admin-player-identity-manager], [data-admin-player-identity-manager-dialog], [data-admin-player-identity-settings], [data-admin-player-identity-settings-row]").count() === 0,
    "A removed standalone or inline identity interface is still present.",
  );

  phase = "opening Add Player";
  await page.locator('[data-admin-terminal-action="add-player"]').first().click();
  const createForm = page.locator("[data-admin-terminal-player-form]").filter({ visible: true }).first();
  await createForm.locator('[name="playerIdentifier"]').waitFor({ state: "visible", timeout: 5000 });
  await createForm.locator('[name="displayName"]').fill("Created RFID Player");
  await createForm.locator('[name="rosterLabel"]').fill("GRADE-10-02");
  await createForm.locator('[name="playerIdentifier"]').fill(CREATE_IDENTIFIER);
  await createForm.locator('[name="accessCode"]').fill(CREATE_ACCESS_CODE);
  await createForm.locator('[name="status"]').selectOption("active");
  await createForm.locator('[name="startingLocation"]').selectOption("NORTHREACH");
  await createForm.locator('[data-admin-terminal-action="create-player"]').click();

  phase = "verifying created credentials";
  const confirmation = page.locator("[data-admin-player-created-confirmation]");
  await confirmation.waitFor({ state: "visible", timeout: 8000 });
  const createdCredentials = {
    playerIdentifier: (await confirmation.locator("[data-admin-player-created-identifier]").textContent())?.trim() || "",
    accessCode: (await confirmation.locator("[data-admin-player-created-access-code]").textContent())?.trim() || "",
  };

  let currentWrites = mappedWrites();
  const createWrite = currentWrites.find((write) =>
    write.service === "admin-bff" && write.pathname.endsWith(`/games/${GAME_ID}/players`)
  );
  assert(createWrite, "Player create emitted no authenticated Admin BFF request.");
  assert(
    createWrite.payload.playerIdentifier === CREATE_IDENTIFIER &&
      createWrite.payload.accessCode === CREATE_ACCESS_CODE,
    `Player create sent the wrong identity payload: ${JSON.stringify(createWrite.body)}.`,
  );
  assert(!("id" in createWrite.payload) && !("uuid" in createWrite.payload), "Player create exposed an editable UUID.");
  assert(createWrite.headers.authorization === undefined, "Player create exposed Staff Authorization.");
  assert(createWrite.headers["x-econovaria-game-id"] === GAME_ID, "Player create omitted the game header.");
  assert(Boolean(createWrite.headers["x-econovaria-csrf-token"]), "Player create omitted cookie-bound CSRF.");
  assert(
    createdCredentials.playerIdentifier === CREATE_IDENTIFIER &&
      createdCredentials.accessCode === CREATE_ACCESS_CODE,
    `Created credentials were not displayed correctly: ${JSON.stringify(createdCredentials)}.`,
  );
  assert(await page.locator("[data-admin-player-access-code-dialog]").count() === 0, "Legacy credential overlay returned.");
  await closeCreatedPlayerConfirmation();

  phase = "opening Players section";
  await page.locator('[data-admin-section="Players"]').first().click();
  await page.waitForTimeout(500);
  const playerEntry = page.getByText(existingPlayer.displayName, { exact: true }).first();
  await playerEntry.waitFor({ state: "visible", timeout: 8000 });
  await playerEntry.click();

  phase = "opening Edit Player Profile";
  const playerRow = page.locator(".admin-terminal-player-row").filter({ hasText: existingPlayer.displayName }).first();
  const settingsAction = playerRow.locator('[data-admin-terminal-action="player-settings"]').first();
  await settingsAction.waitFor({ state: "visible", timeout: 8000 });
  await settingsAction.click();

  const profile = page.locator('[data-admin-terminal-modal-backdrop][data-modal-id="player-settings-editor"]').last();
  await profile.waitFor({ state: "visible", timeout: 8000 });
  await profile.locator("[data-admin-player-profile-save-status]").waitFor({ state: "visible", timeout: 8000 });
  assert(
    await profile.getAttribute("data-admin-player-profile-identity-editor") !== null,
    "Edit Player Profile was not decorated as the identity editing surface.",
  );
  assert(
    await page.locator("[data-admin-player-identity-settings], [data-admin-player-identity-settings-row]").count() === 0,
    "Opening Edit Player Profile recreated the removed inline identity panel.",
  );

  const identifierInput = profile.locator('[name="playerIdentifier"]');
  const accessCodeInput = profile.locator('[name="accessCode"]');
  assert(
    await identifierInput.inputValue() === existingPlayer.playerIdentifier,
    `Edit Player Profile showed a generated ID instead of ${existingPlayer.playerIdentifier}.`,
  );
  assert(
    await accessCodeInput.getAttribute("type") === "password" && await accessCodeInput.inputValue() === "",
    "Edit Player Profile exposed or prefilled an Access Code.",
  );
  assert(!(await profile.textContent()).includes(PLAYER_UUID), "Edit Player Profile exposed the backend UUID.");

  phase = "saving Player ID and Access Code from Edit Player Profile";
  await identifierInput.fill(UPDATE_IDENTIFIER);
  await accessCodeInput.fill(UPDATE_ACCESS_CODE);
  await profile.locator('[data-admin-terminal-action="confirm-player-settings-save"]').click();
  await profile.getByText("Player profile, Player ID, and Access Code saved.", { exact: true })
    .waitFor({ state: "visible", timeout: 8000 });
  assert(await profile.isVisible(), "Edit Player Profile closed after saving credentials.");
  assert(await page.locator("[data-admin-player-created-confirmation]").count() === 0, "A Player-created confirmation opened during an existing-player update.");
  assert(await page.locator("[data-admin-player-access-code-dialog]").count() === 0, "A second credential popup opened.");

  phase = "saving Player ID without rotating Access Code";
  await identifierInput.fill(ID_ONLY_IDENTIFIER);
  await accessCodeInput.fill("");
  await profile.locator('[data-admin-terminal-action="confirm-player-settings-save"]').click();
  await profile.getByText("Player profile and Player ID saved. The current Access Code was not changed.", { exact: true })
    .waitFor({ state: "visible", timeout: 8000 });

  phase = "verifying BFF profile and identity writes";
  currentWrites = mappedWrites();
  const profileWrites = currentWrites.filter((write) =>
    write.service === "admin-bff" &&
    write.method === "PATCH" &&
    write.pathname.endsWith(`/games/${GAME_ID}/players/${PLAYER_UUID}/settings`)
  );
  assert(profileWrites.length === 2, `Expected two profile settings writes, received ${profileWrites.length}.`);
  for (const write of profileWrites) {
    assert(
      write.body?.settings?.displayName === existingPlayer.displayName,
      `Profile settings were incomplete: ${JSON.stringify(write.body)}.`,
    );
    assert(
      !("id" in (write.body?.settings || {})) && !("uuid" in (write.body?.settings || {})),
      "Profile settings exposed UUID fields.",
    );
  }

  const identityWrites = currentWrites.filter((write) =>
    write.service === "admin-bff" &&
    write.pathname.endsWith(`/games/${GAME_ID}/players/${PLAYER_UUID}/access-code/reset`)
  );
  assert(identityWrites.length === 2, `Expected two credential writes, received ${identityWrites.length}.`);
  assert(
    identityWrites[0].payload.playerIdentifier === UPDATE_IDENTIFIER &&
      identityWrites[0].payload.accessCode === UPDATE_ACCESS_CODE,
    `Credential update sent the wrong payload: ${JSON.stringify(identityWrites[0].body)}.`,
  );
  assert(
    identityWrites[1].payload.playerIdentifier === ID_ONLY_IDENTIFIER &&
      !Object.hasOwn(identityWrites[1].payload, "accessCode"),
    `Player-ID-only update reset the Access Code: ${JSON.stringify(identityWrites[1].body)}.`,
  );

  for (const write of [...profileWrites, ...identityWrites]) {
    assert(write.headers.authorization === undefined, "A profile write exposed Staff Authorization.");
    assert(write.headers["x-econovaria-game-id"] === GAME_ID, "A profile write omitted the game header.");
    assert(Boolean(write.headers["x-econovaria-csrf-token"]), "A profile write omitted cookie-bound CSRF.");
  }
  assert(errors.length === 0, errors[0] || "Unexpected browser error.");

  phase = "passed";
  await saveDiagnostics("admin-player-identity", {
    createdCredentials,
    profileWrites,
    identityWrites,
  });
  await harness.finish({ createdCredentials, profileWrites, identityWrites });
  console.log("Admin Edit Player Profile identity, Player-created confirmation, and Access Code smoke passed.");
} catch (error) {
  await saveDiagnostics("admin-player-identity-failure", {
    failure: error.stack || error.message || String(error),
  });
  await harness.finish({ failure: error.stack || error.message || String(error) });
  throw error;
}
