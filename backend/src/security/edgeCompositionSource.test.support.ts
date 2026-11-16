import { staticValueImports } from "./staticValueImports.test.support.ts";

declare const Deno: { readTextFile(path: URL): Promise<string> };

/** Read the explicit route composition after entrypoint extraction. */
export async function readEdgeCompositionSource(
  path: string | URL,
): Promise<string> {
  const root = path instanceof URL
    ? path
    : new URL(path, new URL("../../", import.meta.url));
  const modules = root.pathname.endsWith("/player-api/runtime.ts")
    ? ["dispatchPlayerWorldRoutes.ts", "dispatchPlayerEconomyRoutes.ts"]
    : root.href ===
        new URL(
          "../../supabase/functions/classroom-api/index.ts",
          import.meta.url,
        ).href
    ? [
      "dispatchPlayerWorldRoutes.ts",
      "dispatchPlayerEconomyRoutes.ts",
      "dispatchStaffRoutes.ts",
      "classroomClients.ts",
    ]
    : [];
  const source = await Deno.readTextFile(root);
  const sources = new Map<string, string>([[root.href, source]]);
  for (const module of modules) {
    const url = new URL(module, root);
    sources.set(url.href, await Deno.readTextFile(url));
  }
  assertRouteCompositionReachable(root, modules, sources);
  return [
    source,
    ...modules.map((module) => sources.get(new URL(module, root).href)),
  ].join("\n");
}

/** Reject disconnected route source before it can satisfy a contract assertion. */
export function assertRouteModuleImports(
  source: string,
  modules: readonly string[],
): void {
  const imports = new Set(staticValueImports(source));
  for (const module of modules) {
    if (!imports.has(`./${module}`)) {
      throw new Error(`Route composition no longer imports ${module}`);
    }
  }
}

/** Only reviewed value-import-connected modules can supply source assertions. */
export function assertRouteCompositionReachable(
  root: URL,
  modules: readonly string[],
  sources: ReadonlyMap<string, string>,
): void {
  const allowed = new Set([
    root.href,
    ...modules.map((module) => new URL(module, root).href),
  ]);
  const reached = new Set<string>();
  const pending = [root.href];
  while (pending.length) {
    const current = pending.pop()!;
    if (reached.has(current)) continue;
    reached.add(current);
    const source = sources.get(current);
    if (typeof source !== "string") {
      throw new Error(`Missing composition source: ${current}`);
    }
    for (const specifier of staticValueImports(source)) {
      if (!specifier.startsWith(".")) continue;
      const target = new URL(specifier, current).href;
      if (allowed.has(target)) pending.push(target);
    }
  }
  for (const module of modules) {
    if (!reached.has(new URL(module, root).href)) {
      throw new Error(`Route composition is disconnected: ${module}`);
    }
  }
}
