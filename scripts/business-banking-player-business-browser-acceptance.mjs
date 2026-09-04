#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runConnectedPlayerBffAcceptance as runBaseConnectedPlayerBffAcceptance } from "./connected-player-bff-acceptance-loader.mjs";
import { restartLocalEdgeRuntime } from "./local-edge-runtime-isolation.mjs";

function replaceExactlyOnce(source, label, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label} expected one canonical source match, found ${count}.`);
  }
  return source.replace(before, after);
}

function replaceSection(source, label, startNeedle, endNeedle, replacement) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  if (start < 0 || end <= start) {
    throw new Error(`${label} could not resolve its exact source boundary.`);
  }
  return `${source.slice(0, start)}${replacement}\n\n${source.slice(end)}`;
}

function adaptMutationCompletion(source) {
  source = replaceExactlyOnce(
    source,
    "Business mutation stale-toast reset",
    `  await configure(target);
  const responsePromise = page.waitForResponse(`,
    `  await configure(target);
  await page.locator(".player-terminal-toast").evaluateAll((nodes) => nodes.forEach((node) => node.remove()));
  const responsePromise = page.waitForResponse(`,
  );

  return replaceExactlyOnce(
    source,
    "Business mutation reconciliation wait",
    `  if (response.status() !== 200 || payload?.ok !== true) {
    throw new Error(\`${"${endpoint}"} returned ${"${response.status()}"}: ${"${redact(JSON.stringify(payload))}"}\`);
  }
  return operation;`,
    `  if (response.status() !== 200 || payload?.ok !== true) {
    throw new Error(\`${"${endpoint}"} returned ${"${response.status()}"}: ${"${redact(JSON.stringify(payload))}"}\`);
  }
  await page.getByText("Action completed and current information refreshed.", { exact: true }).first().waitFor({
    state: "visible",
    timeout: 60_000,
  });
  return operation;`,
  );
}

function adaptDisclosureInteraction(source) {
  const before = `async function exposeForm(target) {
  await target.evaluate((element) => {
    const details = element.closest("details");
    if (details) details.open = true;
  });
  await target.waitFor({ state: "visible", timeout: 30_000 });
}`;

  const after = `async function exposeForm(target) {
  await target.waitFor({ state: "attached", timeout: 30_000 });
  const disclosure = target.locator("xpath=ancestor::details[1]");
  if ((await disclosure.count()) < 1) {
    await target.waitFor({ state: "visible", timeout: 30_000 });
    return;
  }

  let formReady = false;
  for (let attempt = 0; attempt < 4 && !formReady; attempt += 1) {
    const disclosureOpen = await disclosure.evaluate((element) => element.open === true);
    if (!disclosureOpen) {
      await disclosure.locator("summary").first().click();
    }
    try {
      await target.waitFor({ state: "visible", timeout: 5_000 });
      const interactionTarget = target.locator(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
      ).first();
      if ((await interactionTarget.count()) > 0) {
        await interactionTarget.waitFor({ state: "visible", timeout: 5_000 });
        await interactionTarget.focus();
      }
      formReady = true;
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}`;

  return replaceExactlyOnce(
    source,
    "Business disclosure interaction",
    before,
    after,
  );
}

function adaptBusinessReplayVerification(source) {
  source = replaceExactlyOnce(
    source,
    "Business replay admin fixture",
    "async function createBusiness(page) {",
    "async function createBusiness(page, admin) {",
  );

  const oldBlock = `  const replay = await replayRequest(page, operation.request);
  if (replay.status !== 200 || replay.payload?.ok !== true || !replayed(replay.payload)) {
    throw new Error(\`Business creation replay was not recognized: \${replay.status} \${redact(JSON.stringify(replay.payload))}\`);
  }
  await reloadBusiness(page);
  if ((await page.getByText(COMPANY_NAME, { exact: true }).count()) < 1) {
    throw new Error("Business disappeared after idempotent replay.");
  }
  evidence.mutations.businessReplayDeniedDuplicate = true;`;

  const newBlock = `  const businessCountBeforeReplay = await page.getByText(COMPANY_NAME, { exact: true }).count();
  const balanceBeforeReplay = databaseFundingState(admin, evidence.businessCurrencyCode).cashBalance;
  const replay = await replayRequest(page, operation.request);
  if (replay.status !== 200 || replay.payload?.ok !== true) {
    throw new Error(\`Business creation replay failed: \${replay.status} \${redact(JSON.stringify(replay.payload))}\`);
  }
  await reloadBusiness(page);
  const businessCountAfterReplay = await page.getByText(COMPANY_NAME, { exact: true }).count();
  if (businessCountBeforeReplay < 1 || businessCountAfterReplay !== businessCountBeforeReplay) {
    throw new Error(
      \`Business replay changed the persisted business surface: \${businessCountBeforeReplay} -> \${businessCountAfterReplay}.\`,
    );
  }
  const balanceAfterReplay = databaseFundingState(admin, evidence.businessCurrencyCode).cashBalance;
  if (Math.abs(balanceAfterReplay - balanceBeforeReplay) > 0.001) {
    throw new Error(
      \`Business replay charged capitalization twice: \${balanceBeforeReplay} -> \${balanceAfterReplay}.\`,
    );
  }
  evidence.mutations.businessReplayDeniedDuplicate = true;`;

  source = replaceExactlyOnce(
    source,
    "Business durable replay verification",
    oldBlock,
    newBlock,
  );
  return replaceExactlyOnce(
    source,
    "Business replay admin call",
    "const originalCreate = await createBusiness(player.page);",
    "const originalCreate = await createBusiness(player.page, admin);",
  );
}

function adaptPhase12CanonicalWorkspace(source) {
  const oldEvidence = `  mutations: {
    businessCreated: false,
    businessPersisted: false,
    businessReplayDeniedDuplicate: false,
    productCreated: false,
    productPersisted: false,
    productApproved: false,
    productApprovalPersisted: false,
    productionRun: false,
    productionPersisted: false,
    priceUpdated: false,
    pricePersisted: false,
    employeeHired: false,
    employeePersisted: false,
    employeeTerminated: false,
    terminationPersisted: false,
    statusChanged: false,
    statusPersisted: false,
    unauthenticatedRejected: false,
  },
  requests: [],`;
  const newEvidence = `  mutations: {
    businessCreated: false,
    businessPersisted: false,
    businessReplayDeniedDuplicate: false,
    statusChanged: false,
    statusPersisted: false,
    unauthenticatedRejected: false,
  },
  workspace: {
    rendered: false,
    sectionOrderValid: false,
    navigationValid: false,
    stockroomLocationsRendered: false,
    treasuryRendered: false,
    governanceRendered: false,
    activityRendered: false,
    productCreatorRetired: false,
    instantProductionRetired: false,
    freeTextHiringRetired: false,
    aggregateInputInventoryRetired: false,
    canonicalManufacturingControlRendered: false,
    browserAuthoredEconomicsAbsent: false,
  },
  requests: [],`;
  source = replaceExactlyOnce(
    source,
    "Phase 12 Business evidence shape",
    oldEvidence,
    newEvidence,
  );

  const workspaceVerification = `async function verifyPhase12CanonicalWorkspace(page) {
  await openBusiness(page);
  const workspace = page.locator("[data-business-workspace-v2]").first();
  await workspace.waitFor({ state: "visible", timeout: 30_000 });
  evidence.workspace.rendered = true;

  const expectedSections = [
    "overview", "products", "stockroom", "procurement", "production",
    "workforce", "equipment", "sales", "finance", "governance", "activity",
  ];
  const sectionKeys = await workspace.locator("[data-business-workspace-section]").evaluateAll(
    (nodes) => nodes.map((node) => node.getAttribute("data-business-workspace-section")),
  );
  if (JSON.stringify(sectionKeys) !== JSON.stringify(expectedSections)) {
    throw new Error(\`Canonical Business workspace section order drifted: \${JSON.stringify(sectionKeys)}.\`);
  }
  evidence.workspace.sectionOrderValid = true;

  const navigation = workspace.locator('nav[aria-label="Business workspace"]');
  await navigation.waitFor({ state: "visible", timeout: 30_000 });
  const navigationKeys = await navigation.locator("[data-business-workspace-link]").evaluateAll(
    (nodes) => nodes.map((node) => node.getAttribute("data-business-workspace-link")),
  );
  if (JSON.stringify(navigationKeys) !== JSON.stringify(expectedSections)) {
    throw new Error(\`Canonical Business navigation drifted: \${JSON.stringify(navigationKeys)}.\`);
  }
  evidence.workspace.navigationValid = true;

  const retiredEndpoints = [
    ["businessProductCreate", "productCreatorRetired"],
    ["businessProduction", "instantProductionRetired"],
    ["businessHire", "freeTextHiringRetired"],
  ];
  for (const [endpoint, evidenceKey] of retiredEndpoints) {
    const count = await workspace.locator(\`form[data-endpoint="\${endpoint}"]\`).count();
    if (count !== 0) {
      throw new Error(\`Retired Business endpoint \${endpoint} remained rendered \${count} time(s).\`);
    }
    evidence.workspace[evidenceKey] = true;
  }

  if (await workspace.getByText("INPUT INVENTORY", { exact: true }).count()) {
    throw new Error("Legacy aggregate Input Inventory remained visible in the Phase 12 workspace.");
  }
  evidence.workspace.aggregateInputInventoryRetired = true;

  const productSection = workspace.locator('[data-business-workspace-section="products"]');
  await productSection.waitFor({ state: "visible", timeout: 30_000 });
  await productSection.getByText(
    "Physical production uses canonical products and recipe access. Browser-authored product economics are not exposed.",
    { exact: true },
  ).waitFor({ state: "visible", timeout: 30_000 });
  evidence.workspace.browserAuthoredEconomicsAbsent = true;

  const manufacturing = workspace.locator('form[data-endpoint="businessManufacturingStart"]');
  if ((await manufacturing.count()) !== 1) {
    throw new Error("Canonical manufacturing intent control was not rendered exactly once.");
  }
  await manufacturing.waitFor({ state: "visible", timeout: 30_000 });
  evidence.workspace.canonicalManufacturingControlRendered = true;

  const stockroom = workspace.locator('[data-business-workspace-section="stockroom"]');
  await stockroom.waitFor({ state: "visible", timeout: 30_000 });
  const stockroomLocations = stockroom.locator(".player-terminal-business-stockroom-location");
  if ((await stockroomLocations.count()) !== 4) {
    throw new Error(\`Canonical Stockroom rendered \${await stockroomLocations.count()} locations instead of four.\`);
  }
  evidence.workspace.stockroomLocationsRendered = true;

  const finance = workspace.locator('[data-business-workspace-section="finance"]');
  await finance.waitFor({ state: "visible", timeout: 30_000 });
  const treasury = finance.locator("[data-business-treasury-state]").first();
  if ((await treasury.count()) !== 1) {
    throw new Error("Canonical Business Treasury evidence was not rendered inside Finance.");
  }
  evidence.workspace.treasuryRendered = true;

  const governance = workspace.locator('[data-business-workspace-section="governance"]');
  await governance.waitFor({ state: "visible", timeout: 30_000 });
  evidence.workspace.governanceRendered = true;

  const activity = workspace.locator('[data-business-workspace-section="activity"]');
  await activity.waitFor({ state: "visible", timeout: 30_000 });
  evidence.workspace.activityRendered = true;
}`;

  source = replaceSection(
    source,
    "Phase 12 canonical workspace verification",
    "async function createProduct(page, admin) {",
    "async function runProduction(page) {",
    workspaceVerification,
  );

  source = replaceExactlyOnce(
    source,
    "Phase 12 connected Business sequence",
    `  await createProduct(player.page, admin);
  await runProduction(player.page);
  await updatePrice(player.page);
  await hireEmployee(player.page);
  await terminateEmployee(player.page);
  await changeStatus(player.page);`,
    `  await verifyPhase12CanonicalWorkspace(player.page);
  await changeStatus(player.page);`,
  );

  source = replaceExactlyOnce(
    source,
    "Phase 12 connected Business completion evidence",
    `  if (!evidence.fixtureCreditApplied || !evidence.fixtureCreditVisible || !Object.values(evidence.mutations).every(Boolean)) {
    throw new Error(\`Connected Player Business evidence is incomplete: \${JSON.stringify({
      fixtureCreditApplied: evidence.fixtureCreditApplied,
      fixtureCreditVisible: evidence.fixtureCreditVisible,
      mutations: evidence.mutations,
    })}\`);
  }`,
    `  if (
    !evidence.fixtureCreditApplied ||
    !evidence.fixtureCreditVisible ||
    !Object.values(evidence.mutations).every(Boolean) ||
    !Object.values(evidence.workspace).every(Boolean)
  ) {
    throw new Error(\`Connected Player Business evidence is incomplete: \${JSON.stringify({
      fixtureCreditApplied: evidence.fixtureCreditApplied,
      fixtureCreditVisible: evidence.fixtureCreditVisible,
      mutations: evidence.mutations,
      workspace: evidence.workspace,
    })}\`);
  }`,
  );

  return replaceExactlyOnce(
    source,
    "Phase 12 connected Business summary evidence",
    `  mutations: evidence.mutations,
  requestCount: evidence.requests.length,`,
    `  mutations: evidence.mutations,
  workspace: evidence.workspace,
  requestCount: evidence.requests.length,`,
  );
}

async function runConnectedPlayerBffAcceptance(entryUrl) {
  const entryPath = fileURLToPath(entryUrl);
  const canonicalCorePath = entryPath.replace(/\.mjs$/u, ".core.mjs");
  const source = adaptPhase12CanonicalWorkspace(
    adaptMutationCompletion(
      adaptDisclosureInteraction(
        adaptBusinessReplayVerification(await readFile(canonicalCorePath, "utf8")),
      ),
    ),
  );
  const temporaryDirectory = await mkdtemp(join(dirname(entryPath), ".business-bff-replay-"));
  const temporaryEntryPath = join(temporaryDirectory, basename(entryPath));
  const temporaryCorePath = temporaryEntryPath.replace(/\.mjs$/u, ".core.mjs");
  try {
    await writeFile(temporaryCorePath, source, "utf8");
    await runBaseConnectedPlayerBffAcceptance(pathToFileURL(temporaryEntryPath).href);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

await restartLocalEdgeRuntime();
await runConnectedPlayerBffAcceptance(import.meta.url);
