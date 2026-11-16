import { readEdgeCompositionSource, assertRouteCompositionReachable } from "../../../security/edgeCompositionSource.test.support.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const SHARED_ROOTS = [
  {
    name: "Staff API",
    path: "supabase/functions/staff-api/index.ts",
  },
  {
    name: "Classroom API",
    path: "supabase/functions/classroom-api/index.ts",
  },
] as const;

for (const root of SHARED_ROOTS) {
  Deno.test(`${root.name} composes the shared Staff bootstrap handler`, async () => {
    const source = await readEdgeCompositionSource(root.path);

    assertMatch(
      source,
      /import\s*\{[\s\S]*?handleStaffBootstrapRequest[\s\S]*?\}\s*from\s*["'][^"']*staffBootstrapHttpHandler\.ts["']/,
    );
    assertMatch(
      source,
      /url\.pathname\.endsWith\(["']\/staff\/bootstrap["']\)/,
    );
    assertMatch(
      source,
      /handleStaffBootstrapRequest\(request,\s*\{\s*createAuthClient,\s*createServiceClient,?\s*\}\)/,
    );
  });
}

Deno.test("Web Session login, status, and MFA compose the shared Staff bootstrap handler", async () => {
  const root = new URL("../../../../supabase/functions/web-session-api/index.ts", import.meta.url);
  const modules = ["sessionActions.ts", "sessionUpstream.ts"];
  const sources = new Map<string, string>();
  for (const url of [root, ...modules.map((name) => new URL(name, root))]) {
    sources.set(url.href, await Deno.readTextFile(url));
  }
  assertRouteCompositionReachable(root, modules, sources);
  const source = [...sources.values()].join("\n");
  const login = functionSource(source, "async function handleLogin");
  const status = functionSource(source, "async function handleStatus");
  const mfa = functionSource(source, "async function handleMfa");
  const loader = functionSource(source, "async function loadStaffBootstrap");

  assertMatch(login, /await loadStaffBootstrap\(\s*payload\.accessToken,\s*adminServiceClient,?\s*\)/);
  assertMatch(
    status,
    /await loadStaffBootstrap\(\s*resolved\.payload\.accessToken,\s*adminServiceClient,?\s*\)/,
  );
  assertMatch(mfa, /await loadStaffBootstrap\(\s*elevated\.accessToken,\s*adminServiceClient,?\s*\)/);
  assertMatch(loader, /https:\/\/web-session\.internal\/staff\/bootstrap/);
  assertMatch(
    loader,
    /handleStaffBootstrapRequest\(request,\s*\{\s*createAuthClient,\s*createServiceClient:\s*\(\)\s*=>\s*adminServiceClient,?\s*\}\)/,
  );
});

function functionSource(source: string, declaration: string): string {
  const start = source.indexOf(declaration);
  if (start < 0) throw new Error(`Missing ${declaration}.`);
  const next = source.indexOf("\nexport async function ", start + declaration.length);
  return source.slice(start, next < 0 ? source.length : next);
}

function assertMatch(value: string, pattern: RegExp): void {
  if (!pattern.test(value)) {
    throw new Error(`Expected source to match ${pattern}.`);
  }
}
