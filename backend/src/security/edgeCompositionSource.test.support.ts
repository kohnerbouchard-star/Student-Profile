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
    : [];
  const source = await Deno.readTextFile(root);
  assertRouteModuleImports(source, modules);
  return [
    source,
    ...(await Promise.all(
      modules.map((module) => Deno.readTextFile(new URL(module, root))),
    )),
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
