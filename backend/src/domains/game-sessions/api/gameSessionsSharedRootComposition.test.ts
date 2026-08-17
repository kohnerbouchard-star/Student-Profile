export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string): Promise<string>;
};

const ROOTS = [
  {
    name: "Classroom API",
    path: "supabase/functions/classroom-api/index.ts",
  },
  {
    name: "Staff API",
    path: "supabase/functions/staff-api/index.ts",
  },
] as const;

for (const root of ROOTS) {
  Deno.test(`${root.name} composes both reviewed Game Sessions handlers`, async () => {
    const source = await Deno.readTextFile(root.path);

    assertMatch(
      source,
      /handleResetGameJoinCodeRequest\(\s*request,\s*gameJoinCodeRoute\.gameSessionId,\s*\{\s*resolveStaffForRequest,?\s*\}/,
    );
    assertMatch(
      source,
      /handleGameSettingsRequest\(\s*request,\s*gameSettingsRoute\.gameSessionId,\s*\{\s*resolveStaffForRequest,?\s*\}/,
    );
  });
}

function assertMatch(value: string, pattern: RegExp): void {
  if (!pattern.test(value)) {
    throw new Error(`Expected source to match ${pattern}.`);
  }
}
