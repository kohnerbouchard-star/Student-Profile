#!/usr/bin/env node

import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runConnectedPlayerBffAcceptance } from "./connected-player-bff-acceptance-loader.mjs";
import { restartLocalEdgeRuntime } from "./local-edge-runtime-isolation.mjs";

const entryPath = fileURLToPath(import.meta.url);
const corePath = entryPath.replace(/\.mjs$/u, ".core.mjs");
const diagnosticEntryPath = entryPath.replace(/\.mjs$/u, ".diagnostic.mjs");
const diagnosticCorePath = diagnosticEntryPath.replace(/\.mjs$/u, ".core.mjs");
const clickMarker = "    await quoteButton.click();";
const failureMarker = '    if (!response) throw new Error("A stable authoritative Stock review did not emit the buy quote request.");';
let source = await readFile(corePath, "utf8");
if (source.split(clickMarker).length - 1 !== 1 || source.split(failureMarker).length - 1 !== 1) {
  throw new Error("Market diagnostic acceptance could not locate the canonical buy-quote transition.");
}
source = source.replace(clickMarker, `    await page.evaluate(() => {
      globalThis.__econovariaMarketDiagnosticToasts = [];
      globalThis.__econovariaMarketDiagnosticObserver?.disconnect?.();
      const capture = () => {
        for (const toast of document.querySelectorAll(".player-terminal-toast")) {
          const text = String(toast.textContent || "").trim();
          if (text && !globalThis.__econovariaMarketDiagnosticToasts.includes(text)) {
            globalThis.__econovariaMarketDiagnosticToasts.push(text);
          }
        }
      };
      const observer = new MutationObserver(capture);
      observer.observe(document.body, { childList: true, subtree: true });
      globalThis.__econovariaMarketDiagnosticObserver = observer;
      capture();
    });
    await quoteButton.click();`);
source = source.replace(failureMarker, `    if (!response) {
      const diagnostics = await page.evaluate(() => {
        globalThis.__econovariaMarketDiagnosticObserver?.disconnect?.();
        const currentForm = document.querySelector('form[data-player-market-order-form="buy-quote"]');
        const field = (name) => String(currentForm?.elements.namedItem(name)?.value || "");
        let storedSession = null;
        try {
          storedSession = JSON.parse(sessionStorage.getItem("econovaria.player.auth.v1") || "null");
        } catch {}
        const submit = currentForm?.querySelector('button[type="submit"]');
        return {
          toasts: globalThis.__econovariaMarketDiagnosticToasts || [],
          formValid: currentForm?.checkValidity?.() === true,
          buttonDisabled: submit?.disabled ?? null,
          buttonBusy: submit?.getAttribute?.("aria-busy") || "",
          ticker: field("ticker"),
          quantity: field("quantity"),
          expectedPrice: field("expectedPrice"),
          expectedTickIndex: field("expectedTickIndex"),
          sourceAccount1Present: Boolean(field("sourceAccountKey1")),
          targetAmount1: field("targetAmount1"),
          optionalFundingPresent: Boolean(
            field("sourceAccountKey2") || field("targetAmount2") ||
            field("sourceAccountKey3") || field("targetAmount3")
          ),
          session: {
            authenticated: storedSession?.authenticated === true,
            hasCsrf: /^[A-Za-z0-9_-]{43}$/.test(String(storedSession?.csrfToken || "")),
          },
        };
      });
      throw new Error(\`A stable authoritative Stock review did not emit the buy quote request. Diagnostics: \${redact(JSON.stringify(diagnostics))}\`);
    }`);

await restartLocalEdgeRuntime();
await writeFile(diagnosticCorePath, source, "utf8");
try {
  await runConnectedPlayerBffAcceptance(pathToFileURL(diagnosticEntryPath).href);
} finally {
  await rm(diagnosticCorePath, { force: true });
}
