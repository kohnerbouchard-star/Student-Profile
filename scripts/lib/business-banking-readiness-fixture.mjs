import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export const corePath = "scripts/business-banking-player-business-browser-acceptance.core.mjs";
export const readSource = (file) => readFile(path.join(root, file), "utf8");
export function section(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  if (from < 0 || to <= from) throw new Error(`Missing source boundary: ${start}`);
  return source.slice(from, to);
}

// Execute the real two-stage source transformations with only filesystem/import
// effects replaced. No browser, process, credential or database operation runs.
export async function materializeBusinessSource(read = readSource) {
  const files = new Map([[path.join(root, corePath), await read(corePath)]]);
  let sequence = 0, materialized;
  const filesystem = {
    fileURLToPath, pathToFileURL, basename: path.basename, dirname: path.dirname, join: path.join,
    readFile: async (file) => { if (!files.has(file)) throw new Error("Unknown fixture file"); return files.get(file); },
    writeFile: async (file, source) => { files.set(file, source); },
    mkdtemp: async (prefix) => `${prefix}${++sequence}`,
    rm: async () => {},
  };
  const loader = await read("scripts/connected-player-bff-acceptance-loader.mjs");
  const loaderBody = loader.slice(loader.indexOf("function replaceRequired("))
    .replace("export async function runConnectedPlayerBffAcceptance", "async function runConnectedPlayerBffAcceptance")
    .replace("await import(pathToFileURL(materializedPath).href);", "captureMaterialized(source);");
  const second = vm.createContext({ ...filesystem, captureMaterialized: (source) => { materialized = source; } });
  vm.runInContext(loaderBody, second);
  const entry = await read("scripts/business-banking-player-business-browser-acceptance.mjs");
  const firstBody = section(entry, "function replaceExactlyOnce(", "\nawait restartLocalEdgeRuntime();");
  const first = vm.createContext({ ...filesystem,
    runBaseConnectedPlayerBffAcceptance: (url) => second.runConnectedPlayerBffAcceptance(url),
  });
  vm.runInContext(firstBody, first);
  await first.runConnectedPlayerBffAcceptance(pathToFileURL(path.join(root, corePath.replace(".core.mjs", ".mjs"))).href);
  if (!materialized) throw new Error("Business materialization produced no source");
  return materialized;
}

export function readinessHelpers(source) {
  return section(source, "function readyCurrencyBalance(", "\nasync function openBusiness(");
}

export function fixture(source) {
  const state = { routeLoading: { banking: true }, routeErrors: {}, data: {
    resourceStatus: { banking: { state: "loading" } }, session: { currencyCode: "LUM" },
    banking: { balances: [], checking: { currencyCode: "LUM", balance: 0 } },
  } };
  let card = null, visibility = "visible", disposed = 0;
  const evidence = {}, requests = [], frames = [];
  const sandbox = vm.createContext({
    Econovaria: { playerTerminal: { getState: () => state } },
    document: { querySelector: () => card }, getComputedStyle: () => ({ visibility }),
    evidence, setTimeout, clearTimeout,
    openRoute: async (...args) => { requests.push(args.slice(1)); },
  });
  vm.runInContext(readinessHelpers(source), sandbox);
  const page = {
    waitForFunction: async (predicate, code, options) => {
      requests.push({ code, ...options });
      for (const frame of frames) {
        frame();
        const value = predicate(code);
        // Playwright polls a synchronous predicate. Promise truthiness is a bug.
        if (value?.then) throw new Error("Readiness predicate must be synchronous");
        if (value) return { jsonValue: async () => value, dispose: async () => { disposed++; } };
      }
      throw new Error("Synthetic 30-second deadline");
    },
    evaluate: async (predicate, code) => predicate(code),
  };
  return {
    state, evidence, frames, requests, sandbox, page,
    card: (balance, { visible = true } = {}) => { card = balance === null ? null : {
      querySelector: () => ({ textContent: `LUM ${balance}` }),
      getClientRects: () => visible ? [1] : [],
    }; },
    visibility: (value) => { visibility = value; },
    ready: (balance = 40) => {
      state.routeLoading.banking = false;
      state.data.resourceStatus.banking.state = "ready";
      state.data.banking.balances = [{ accountType: "checking", currencyCode: "LUM", balance }];
    },
    disposed: () => disposed,
    read: (options = {}) => sandbox.checkingBalance(page, "LUM", options),
    poll: () => sandbox.readyCurrencyBalance("LUM"),
  };
}
