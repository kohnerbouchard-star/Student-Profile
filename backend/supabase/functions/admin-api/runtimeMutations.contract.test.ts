import { runtimeMutationDispatch } from "./runtimeMutations.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("join-code rotation is dispatched without consuming a request body", () => {
  assertEquals(
    runtimeMutationDispatch(
      "11111111-1111-4111-8111-111111111111",
      "/join-code/reset",
      "POST",
    ),
    {
      kind: "direct",
      classroomPath:
        "/games/11111111-1111-4111-8111-111111111111/join-code/reset",
      body: {},
    },
  );
});

Deno.test("only recognized runtime mutation routes consume a JSON body", () => {
  assertEquals(
    runtimeMutationDispatch(
      "11111111-1111-4111-8111-111111111111",
      "/players",
      "POST",
    ),
    { kind: "normalized" },
  );
  assertEquals(
    runtimeMutationDispatch(
      "11111111-1111-4111-8111-111111111111",
      "/settings",
      "POST",
    ),
    null,
  );
  assertEquals(
    runtimeMutationDispatch(
      "11111111-1111-4111-8111-111111111111",
      "/join-code/reset",
      "GET",
    ),
    null,
  );
});

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`expected ${expectedJson}, received ${actualJson}`);
  }
}
