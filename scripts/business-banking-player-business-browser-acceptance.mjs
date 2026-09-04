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

function adaptPhase12WorkspaceAcceptance(source) {
  const oldMutations = `  mutations: {
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
  },`;

  const phase12Mutations = `  mutations: {
    businessCreated: false,
    businessPersisted: false,
    businessReplayDeniedDuplicate: false,
    canonicalWorkspaceRendered: false,
    workspaceNavigationComplete: false,
    legacyProductCreatorRetired: false,
    legacyProductionControlRetired: false,
    legacyFreeformHiringRetired: false,
    productsRecipesRendered: false,
    stockroomRendered: false,
    procurementRendered: false,
    productionRendered: false,
    workforceRendered: false,
    equipmentRendered: false,
    salesRendered: false,
    financeRendered: false,
    governanceRendered: false,
    activityRendered: false,
    statusChanged: false,
    statusPersisted: false,
    unauthenticatedRejected: false,
  },`;

  source = replaceExactlyOnce(
    source,
    "Phase 12 Business evidence model",
    oldMutations,
    phase12Mutations,
  );

  const helper = `async function verifyPhase12Workspace(page) {
  const workspace = page.locator("[data-business-workspace-v2]").first();
  await workspace.waitFor({ state: "visible", timeout: 30_000 });
  evidence.mutations.canonicalWorkspaceRendered = true;

  const sectionKeys = [
    "overview",
    "products",
    "stockroom",
    "procurement",
    "production",
    "workforce",
    "equipment",
    "sales",
    "finance",
    "governance",
    "activity",
  ];
  const links = workspace.locator("[data-business-workspace-link]");
  if ((await links.count()) !== sectionKeys.length) {
    throw new Error(
      \`Phase 12 Business workspace navigation rendered \${await links.count()} links instead of \${sectionKeys.length}.\`,
    );
  }
  for (const key of sectionKeys) {
    const link = workspace.locator(\`[data-business-workspace-link="\${key}"]\`).first();
    const section = workspace.locator(\`[data-business-workspace-section="\${key}"]\`).first();
    await link.waitFor({ state: "visible", timeout: 30_000 });
    await section.waitFor({ state: "visible", timeout: 30_000 });
    const href = String(await link.getAttribute("href") || "");
    if (href !== \`#business-workspace-\${key}\`) {
      throw new Error(\`Phase 12 Business workspace link \${key} targeted \${href || "nothing"}.\`);
    }
  }
  evidence.mutations.workspaceNavigationComplete = true;

  const retiredEndpoints = [
    "businessProductCreate",
    "businessProduction",
    "businessHire",
  ];
  for (const endpoint of retiredEndpoints) {
    if ((await workspace.locator(\`form[data-endpoint="\${endpoint}"]\`).count()) !== 0) {
      throw new Error(\`Retired Business control \${endpoint} was rendered in the Phase 12 workspace.\`);
    }
  }
  if ((await workspace.getByText("Create a product", { exact: true }).count()) !== 0) {
    throw new Error("The retired free-form physical Product Creator was rendered.");
  }
  if ((await workspace.getByText("INPUT INVENTORY", { exact: true }).count()) !== 0) {
    throw new Error("The retired aggregate Business Input Inventory surface was rendered.");
  }
  evidence.mutations.legacyProductCreatorRetired = true;
  evidence.mutations.legacyProductionControlRetired = true;

  const workforce = workspace.locator('[data-business-workspace-section="workforce"]').first();
  for (const field of ["role", "wagePerCycle", "productivityIndex"]) {
    if ((await workforce.locator(\`[name="\${field}"]\`).count()) !== 0) {
      throw new Error(\`The Phase 12 workforce surface exposed retired caller-authored field \${field}.\`);
    }
  }
  await workforce.locator(".player-terminal-workforce-market").first().waitFor({
    state: "attached",
    timeout: 30_000,
  });
  evidence.mutations.legacyFreeformHiringRetired = true;

  const products = workspace.locator('[data-business-workspace-section="products"]').first();
  await products.getByText("CANONICAL RECIPES", { exact: true }).first().waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await products.getByText(
    "Browser-authored product economics are not exposed.",
    { exact: true },
  ).first().waitFor({ state: "visible", timeout: 30_000 });
  evidence.mutations.productsRecipesRendered = true;

  const production = workspace.locator('[data-business-workspace-section="production"]').first();
  const manufacturing = production.locator(
    'form[data-endpoint="businessManufacturingStart"]',
  ).first();
  await manufacturing.waitFor({ state: "attached", timeout: 30_000 });
  for (const field of ["productKey", "quantity", "priority"]) {
    if ((await manufacturing.locator(\`[name="\${field}"]\`).count()) !== 1) {
      throw new Error(\`Canonical manufacturing intent omitted \${field}.\`);
    }
  }

  evidence.mutations.stockroomRendered = true;
  evidence.mutations.procurementRendered = true;
  evidence.mutations.productionRendered = true;
  evidence.mutations.workforceRendered = true;
  evidence.mutations.equipmentRendered = true;
  evidence.mutations.salesRendered = true;
  evidence.mutations.financeRendered = true;
  evidence.mutations.governanceRendered = true;
  evidence.mutations.activityRendered = true;
}`;

  source = replaceExactlyOnce(
    source,
    "Phase 12 Business workspace verifier",
    "async function createProduct(page, admin) {",
    `${helper}\n\nasync function createProduct(page, admin) {`,
  );

  const oldFlow = `  await createProduct(player.page, admin);
  await runProduction(player.page);
  await updatePrice(player.page);
  await hireEmployee(player.page);
  await terminateEmployee(player.page);
  await changeStatus(player.page);`;

  const phase12Flow = `  await verifyPhase12Workspace(player.page);
  await changeStatus(player.page);`;

  return replaceExactlyOnce(
    source,
    "Phase 12 connected Business lifecycle",
    oldFlow,
    phase12Flow,
  );
}

async function runConnectedPlayerBffAcceptance(entryUrl) {
  const entryPath = fileURLToPath(entryUrl);
  const canonicalCorePath = entryPath.replace(/\.mjs$/u, ".core.mjs");
  const source = adaptPhase12WorkspaceAcceptance(
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
