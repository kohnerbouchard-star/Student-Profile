import { readFileSync, writeFileSync } from "node:fs";
import {
  BASE_URL,
  createSpecializedQualityHarness,
  GAME_ID,
} from "./admin-specialized-quality-fixture.mjs";

const MANUAL_IDENTIFIER = "RFID:MANUAL-303";
const MANUAL_ACCESS_CODE = "MANUAL-8246";

function flatten(value) {
  const source = value && typeof value === "object" ? value : {};
  const payload = source.payload && typeof source.payload === "object" ? source.payload : {};
  return { ...source, ...payload };
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const indexSource = readFileSync("admin/index.html", "utf8");
const bridgeSource = readFileSync("admin/player-access-code-bridge.js", "utf8");
const createUxSource = readFileSync("admin/player-create-ux.js", "utf8");
assert(indexSource.includes('src="./modal-accessibility.js"'), "Admin modal accessibility controller is not loaded.");
assert(
  indexSource.indexOf('src="./modal-accessibility.js"') < indexSource.indexOf('src="./player-create-ux.js"'),
  "Admin modal accessibility controller must load before Player create UX.",
);
assert(!bridgeSource.includes("renderAccessCodeDialog"), "Legacy credential dialog renderer remains in the access-code bridge.");
assert(!bridgeSource.includes("data-admin-player-access-code-dialog"), "Legacy credential dialog marker remains in the access-code bridge.");
assert(!bridgeSource.includes("style.cssText"), "Access-code bridge still creates inline-styled credential UI.");
assert(!createUxSource.includes("LEGACY_DIALOG_SELECTOR"), "Player create UX still declares a legacy credential-dialog selector.");
assert(!createUxSource.includes("removeLegacyDialog"), "Player create UX still suppresses a legacy credential dialog at runtime.");
assert(!createUxSource.includes("data-admin-player-access-code-dialog"), "Player create UX still references the obsolete credential dialog marker.");
assert(createUxSource.includes("dismissOnEscape: false"), "One-time credential confirmation does not protect acknowledgement on Escape.");
assert(createUxSource.includes("dismissOnBackdrop: false"), "One-time credential confirmation can still be dismissed accidentally through the backdrop.");

let createCount = 0;
const harness = await createSpecializedQualityHarness("player-create-ux", {
  handleProxy: ({ method, path, parsedBody }) => {
    if (method !== "POST" || !path.endsWith(`/games/${GAME_ID}/players`)) return null;
    const payload = flatten(parsedBody);
    createCount += 1;
    return {
      status: 201,
      body: {
        ok: true,
        player: {
          id: `00000000-0000-4000-8000-${String(300 + createCount).padStart(12, "0")}`,
          displayName: payload.displayName,
          rosterLabel: payload.rosterLabel || null,
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
  },
});
const { page, errors, writes, dir } = harness;

async function activeControl() {
  return page.evaluate(() => {
    const active = document.activeElement;
    return {
      tagName: active?.tagName || "",
      ariaLabel: active?.getAttribute?.("aria-label") || "",
      copy: active?.hasAttribute?.("data-admin-player-created-copy") || false,
      done: active?.hasAttribute?.("data-admin-player-created-done") || false,
      action: active?.getAttribute?.("data-admin-terminal-action") || "",
      insideConfirmation: Boolean(active?.closest?.("[data-admin-player-created-confirmation]")),
    };
  });
}

async function openAddPlayer() {
  await page.locator('[data-admin-section="Overview"]').click();
  const opener = page.locator('[data-admin-terminal-action="add-player"]').first();
  await opener.click();
  const form = page.locator("[data-admin-terminal-player-form]");
  await form.waitFor({ state: "visible", timeout: 5000 });
  await form.locator('[name="playerIdentifier"]').waitFor({ state: "visible", timeout: 5000 });
  await page.waitForFunction(() => {
    const identifier = document.querySelector('[data-admin-terminal-player-form] [name="playerIdentifier"]');
    const accessCode = document.querySelector('[data-admin-terminal-player-form] [name="accessCode"]');
    return Boolean(identifier && accessCode && !identifier.required && !accessCode.required);
  }, null, { timeout: 5000 });
  return { form, opener };
}

async function assertConfirmationAccessibility(confirmation) {
  await page.waitForFunction(
    () => document.activeElement?.hasAttribute?.("data-admin-player-created-copy"),
    null,
    { timeout: 3000 },
  );
  const initial = await activeControl();
  assert(initial.copy && initial.insideConfirmation, `Confirmation initial focus is incorrect: ${JSON.stringify(initial)}.`);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(50);
  assert(await confirmation.isVisible(), "Escape dismissed the one-time credential confirmation before acknowledgement.");
  const afterEscape = await activeControl();
  assert(afterEscape.insideConfirmation, `Escape leaked focus outside the confirmation: ${JSON.stringify(afterEscape)}.`);

  await confirmation.locator("[data-admin-player-created-done]").focus();
  await page.keyboard.press("Tab");
  const forwardWrap = await activeControl();
  assert(forwardWrap.ariaLabel === "Close confirmation", `Forward Tab did not wrap to the first control: ${JSON.stringify(forwardWrap)}.`);

  await confirmation.locator('[aria-label="Close confirmation"]').focus();
  await page.keyboard.press("Shift+Tab");
  const reverseWrap = await activeControl();
  assert(reverseWrap.done, `Reverse Tab did not wrap to the last control: ${JSON.stringify(reverseWrap)}.`);

  await confirmation.evaluate((backdrop) => {
    backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(50);
  assert(await confirmation.isVisible(), "Backdrop click dismissed the one-time credential confirmation before acknowledgement.");
  const afterBackdrop = await activeControl();
  assert(afterBackdrop.insideConfirmation, `Backdrop interaction leaked focus: ${JSON.stringify(afterBackdrop)}.`);

  await confirmation.locator("[data-admin-player-created-done]").click();
  await confirmation.waitFor({ state: "detached", timeout: 5000 });
  await page.waitForFunction(() => {
    const control = document.querySelector('[data-admin-terminal-action="add-player"]');
    return control && document.activeElement === control;
  }, null, { timeout: 3000 });
  const restored = await activeControl();
  assert(restored.action === "add-player", `Focus was not restored to Add Player: ${JSON.stringify(restored)}.`);

  return { initial, afterEscape, forwardWrap, reverseWrap, afterBackdrop, restored };
}

async function submitPlayer({ displayName, rosterLabel, playerIdentifier = "", accessCode = "" }) {
  const { form } = await openAddPlayer();
  await form.locator('[name="displayName"]').fill(displayName);
  await form.locator('[name="rosterLabel"]').fill(rosterLabel);
  await form.locator('[name="status"]').selectOption("active");
  await form.locator('[name="startingLocation"]').selectOption("NORTHREACH");
  await form.locator('[name="playerIdentifier"]').fill(playerIdentifier);
  await form.locator('[name="accessCode"]').fill(accessCode);

  const startIndex = writes.length;
  await form.locator('[data-admin-terminal-action="create-player"]').click();
  const started = Date.now();
  while (writes.length === startIndex && Date.now() - started < 5000) {
    await page.waitForTimeout(50);
  }
  assert(writes.length === startIndex + 1, `Expected one create request, received ${writes.length - startIndex}.`);

  const rawWrite = writes.at(-1);
  const normalized = flatten(rawWrite.parsedBody);
  const write = { ...rawWrite, payload: normalized };
  const confirmation = page.locator("[data-admin-player-created-confirmation]");
  await confirmation.waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(50);
  return {
    write,
    title: await confirmation.locator("h3").textContent(),
    identifier: await confirmation.locator("[data-admin-player-created-identifier]").textContent(),
    accessCode: await confirmation.locator("[data-admin-player-created-access-code]").textContent(),
    modalClass: await confirmation.locator("section").first().getAttribute("class"),
    legacyDialogs: await page.locator("[data-admin-player-access-code-dialog]").count(),
    notes: await confirmation.locator(".admin-terminal-player-created-credential small").allTextContents(),
    accessibility: await assertConfirmationAccessibility(confirmation),
  };
}

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });

  const auto = await submitPlayer({
    displayName: "Auto Credential Player",
    rosterLabel: "AUTO-301",
  });
  assert(/^PLR-[A-HJ-NP-Z2-9]{8}$/.test(auto.write.payload.playerIdentifier), `Unexpected generated Player ID ${auto.write.payload.playerIdentifier}.`);
  assert(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(auto.write.payload.accessCode), `Unexpected generated Access Code ${auto.write.payload.accessCode}.`);
  assert(auto.identifier === auto.write.payload.playerIdentifier, "Confirmation Player ID does not match the create payload.");
  assert(auto.accessCode === auto.write.payload.accessCode, "Confirmation Access Code does not match the create payload.");
  assert(auto.notes.every((note) => /generated automatically/i.test(note)), `Generated credential notes are incorrect: ${JSON.stringify(auto.notes)}.`);
  assert(auto.legacyDialogs === 0, "Legacy credential overlay remains in the DOM.");
  assert(/admin-terminal-modal/.test(auto.modalClass || ""), "Confirmation does not use the v606 modal class.");

  const manual = await submitPlayer({
    displayName: "Manual Credential Player",
    rosterLabel: "MANUAL-302",
    playerIdentifier: MANUAL_IDENTIFIER,
    accessCode: MANUAL_ACCESS_CODE,
  });
  assert(manual.write.payload.playerIdentifier === MANUAL_IDENTIFIER, "Manual Player ID was overwritten.");
  assert(manual.write.payload.accessCode === MANUAL_ACCESS_CODE, "Manual Access Code was overwritten.");
  assert(
    manual.identifier === MANUAL_IDENTIFIER && manual.accessCode === MANUAL_ACCESS_CODE,
    "Manual credentials were not confirmed correctly.",
  );
  assert(manual.notes.every((note) => /custom value saved/i.test(note)), `Manual credential notes are incorrect: ${JSON.stringify(manual.notes)}.`);

  if (errors.length) throw new Error(errors[0]);
  writeFileSync(`${dir}/player-create-ux-runtime.json`, JSON.stringify({ auto, manual, writes, errors }, null, 2));
  await harness.capture("player-create-ux");
  await harness.finish({ auto, manual });
  console.log("Add Player credentials, acknowledgement modal, focus trap, Escape protection, and focus restoration passed.");
} catch (error) {
  writeFileSync(`${dir}/player-create-ux-runtime.json`, JSON.stringify({ writes, errors }, null, 2));
  await harness.capture("player-create-ux-failure").catch(() => {});
  await harness.finish({ failure: error.stack || error.message || String(error) });
  throw error;
}
