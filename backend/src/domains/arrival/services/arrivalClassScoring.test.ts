import {
  ARRIVAL_CLASS_IDS,
  ArrivalClassError,
  type ArrivalClassId,
  type ArrivalQuestionAnswer,
} from "../contracts/arrivalClassContracts.ts";
import * as arrivalPublic from "../index.ts";
import {
  buildArrivalGrantCommand,
  createArrivalClassAssignment,
  DEFAULT_ARRIVAL_QUESTIONNAIRE,
  overrideArrivalClassAssignment,
  scoreArrivalQuestionnaire,
} from "./arrivalClassScoring.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const COUNTRIES = [
  "northreach",
  "yrethia",
  "thaloris",
  "solvend",
  "eldoran",
  "valerion",
  "lumenor",
  "xalvoria",
  "dravenlok",
  "syndalis",
] as const;

const ANSWERS: Readonly<Record<ArrivalClassId, readonly string[]>> = {
  analyst: ["compare", "measure", "price", "control", "model", "planner", "insight", "data"],
  builder: ["build", "stabilize", "materials", "workshop", "adapt", "craft", "resilience", "practice"],
  maker: ["build", "measure", "materials", "workshop", "adapt", "craft", "exchange", "experiment"],
  mediator: ["connect", "coordinate", "trust", "community", "ration", "bridge", "exchange", "people"],
  navigator: ["connect", "route", "price", "exchange", "alternate", "scout", "access", "people"],
  operator: ["organize", "stabilize", "process", "control", "model", "planner", "insight", "practice"],
  steward: ["organize", "coordinate", "trust", "community", "ration", "bridge", "access", "people"],
  trader: ["compare", "route", "price", "exchange", "alternate", "scout", "exchange", "data"],
};

Deno.test("every class-country pairing produces deterministic session state and grants", () => {
  for (const classId of ARRIVAL_CLASS_IDS) {
    const score = scoreArrivalQuestionnaire(
      DEFAULT_ARRIVAL_QUESTIONNAIRE,
      answersFor(classId),
    );
    assertEquals(score.selectedClassId, classId);
    assertEquals(score.scores.length, 8);
    assertEquals(score.explanation.includes("published class order"), true);

    for (const countryId of COUNTRIES) {
      const assignment = createArrivalClassAssignment({
        assignmentId: `assignment-${classId}-${countryId}`,
        gameId: "game-1",
        gameSessionId: `session-${countryId}`,
        playerUuid: `player-${classId}`,
        countryId,
        scoreResult: score,
        assignedAt: "2026-07-21T00:00:00.000Z",
      });
      const first = buildArrivalGrantCommand({
        assignment,
        arrivalPackageDefinitionId: `arrival.${countryId}.v1`,
        grantDefinitionId: `class.${classId}.starter.v1`,
      });
      const replay = buildArrivalGrantCommand({
        assignment,
        arrivalPackageDefinitionId: `arrival.${countryId}.v1`,
        grantDefinitionId: `class.${classId}.starter.v1`,
      });
      assertEquals(assignment.countryId, countryId);
      assertEquals(assignment.classId, classId);
      assertEquals(assignment.gameSessionId, `session-${countryId}`);
      assertEquals(assignment.economicRestrictions, []);
      assertEquals(first.idempotencyKey, replay.idempotencyKey);
      assertEquals(first.countryId, countryId);
    }
  }
});

Deno.test("class override is reviewable, revision-safe, and never restricts other paths", () => {
  const score = scoreArrivalQuestionnaire(
    DEFAULT_ARRIVAL_QUESTIONNAIRE,
    answersFor("analyst"),
  );
  const assignment = createArrivalClassAssignment({
    assignmentId: "assignment-override",
    gameId: "game-1",
    gameSessionId: "session-1",
    playerUuid: "player-1",
    countryId: "eldoran",
    scoreResult: score,
    assignedAt: "2026-07-21T00:00:00.000Z",
  });
  const overridden = overrideArrivalClassAssignment(assignment, {
    gameId: "game-1",
    expectedRevision: 0,
    classId: "maker",
    reason: "Player requested a reviewed class correction.",
    changedAt: "2026-07-21T00:05:00.000Z",
  });
  assertEquals(overridden.classId, "maker");
  assertEquals(overridden.source, "admin_override");
  assertEquals(overridden.revision, 1);
  assertEquals(overridden.economicRestrictions, []);

  assertThrowsCode(() => overrideArrivalClassAssignment(overridden, {
    gameId: "game-1",
    expectedRevision: 0,
    classId: "trader",
    reason: "This revision is stale and must be rejected.",
    changedAt: "2026-07-21T00:06:00.000Z",
  }), "arrival_assignment_revision_conflict");
  assertThrowsCode(() => overrideArrivalClassAssignment(overridden, {
    gameId: "game-2",
    expectedRevision: 1,
    classId: "trader",
    reason: "This request belongs to the wrong game.",
    changedAt: "2026-07-21T00:06:00.000Z",
  }), "arrival_assignment_scope_mismatch");
});

Deno.test("scoring rejects incomplete, duplicate, and foreign answers", () => {
  const valid = answersFor("steward");
  assertThrowsCode(
    () => scoreArrivalQuestionnaire(DEFAULT_ARRIVAL_QUESTIONNAIRE, valid.slice(0, 7)),
    "arrival_answers_incomplete",
  );
  assertThrowsCode(
    () => scoreArrivalQuestionnaire(DEFAULT_ARRIVAL_QUESTIONNAIRE, [
      ...valid.slice(0, 7),
      valid[0]!,
    ]),
    "arrival_answer_invalid",
  );
  assertThrowsCode(
    () => scoreArrivalQuestionnaire(DEFAULT_ARRIVAL_QUESTIONNAIRE, [
      ...valid.slice(0, 7),
      { questionId: "learning", optionId: "sensitive-demographic" },
    ]),
    "arrival_answer_invalid",
  );
});

Deno.test("Arrival exposes only the intended server capability and canonical identities", () => {
  assertEquals(Object.keys(arrivalPublic).sort(), [
    "ArrivalClassError", "DEFAULT_ARRIVAL_QUESTIONNAIRE", "preparePlayerArrivalAssignment",
  ]);
  if (arrivalPublic.ArrivalClassError !== ArrivalClassError) throw new Error("Arrival error identity changed");
  if (arrivalPublic.DEFAULT_ARRIVAL_QUESTIONNAIRE !== DEFAULT_ARRIVAL_QUESTIONNAIRE) {
    throw new Error("Arrival questionnaire identity changed");
  }
});

Deno.test("Arrival preparation matches scoring, scoped assignment and grant composition", () => {
  for (const classId of ARRIVAL_CLASS_IDS) {
    for (const countryId of COUNTRIES) {
      const answers = answersFor(classId);
      const score = scoreArrivalQuestionnaire(DEFAULT_ARRIVAL_QUESTIONNAIRE, answers);
      const assignment = createArrivalClassAssignment({
        assignmentId: `assignment-${classId}-${countryId}`,
        gameId: "game-1",
        gameSessionId: "game-1",
        playerUuid: `player-${classId}`,
        countryId,
        scoreResult: score,
        assignedAt: "2026-07-21T00:00:00.000Z",
      });
      const grant = buildArrivalGrantCommand({
        assignment,
        arrivalPackageDefinitionId: `arrival.${countryId}.v1`,
        grantDefinitionId: `class.${classId}.starter.v1`,
      });
      const calls: string[] = [];
      const runtimeInput = {
        countryId,
        arrivalPackageDefinitionId: `arrival.${countryId}.v1`,
        classGrantDefinitionId(selected: string) {
          if (this !== runtimeInput) throw new Error("Grant lookup receiver changed");
          calls.push("grant-definition");
          return `class.${selected}.starter.v1`;
        },
      };
      const prepared = arrivalPublic.preparePlayerArrivalAssignment({
        subject: { scope: { gameId: "game-1", playerUuid: `player-${classId}` }, request: { answers } },
        runtimeInput,
        now: () => { calls.push("clock"); return "2026-07-21T00:00:00.000Z"; },
        createAssignmentId: () => { calls.push("assignment-id"); return `assignment-${classId}-${countryId}`; },
      });
      assertEquals(prepared, { assignment, scoreResult: score, grant });
      assertEquals(calls, ["clock", "assignment-id", "grant-definition"]);
      if (prepared.assignment.scoreResult !== prepared.scoreResult) {
        throw new Error("Prepared assignment lost its score result identity");
      }
      assertEquals(Object.isFrozen(prepared.assignment), true);
      assertEquals(Object.isFrozen(prepared.scoreResult), true);
      assertEquals(Object.isFrozen(prepared.grant), true);
    }
  }
});

Deno.test("Arrival preparation rejects invalid answers before callbacks and preserves callback errors", () => {
  const calls: string[] = [];
  const clockFailure = new Error("clock failure");
  const input = {
    subject: { scope: { gameId: "game-1", playerUuid: "player-1" }, request: { answers: answersFor("analyst") } },
    runtimeInput: {
      countryId: "eldoran",
      arrivalPackageDefinitionId: "arrival.eldoran.v1",
      classGrantDefinitionId: () => { calls.push("grant-definition"); return "class.analyst.starter.v1"; },
    },
    now: () => { calls.push("clock"); throw clockFailure; },
    createAssignmentId: () => { calls.push("assignment-id"); return "assignment-1"; },
  };
  let invalid: unknown;
  try {
    arrivalPublic.preparePlayerArrivalAssignment({
      ...input,
      subject: { ...input.subject, request: { answers: input.subject.request.answers.slice(0, 7) } },
    });
  } catch (error) { invalid = error; }
  if (!(invalid instanceof ArrivalClassError)) throw new Error("Expected canonical Arrival error");
  assertEquals(invalid.code, "arrival_answers_incomplete");
  assertEquals(calls, []);

  let caught: unknown;
  try { arrivalPublic.preparePlayerArrivalAssignment(input); } catch (error) { caught = error; }
  if (caught !== clockFailure) throw new Error("Clock error identity changed");
  assertEquals(calls, ["clock"]);
});

function answersFor(classId: ArrivalClassId): readonly ArrivalQuestionAnswer[] {
  return DEFAULT_ARRIVAL_QUESTIONNAIRE.questions.map((question, index) => ({
    questionId: question.questionId,
    optionId: ANSWERS[classId][index] ?? "",
  }));
}

function assertThrowsCode(run: () => unknown, expectedCode: string): void {
  try {
    run();
  } catch (error) {
    assertEquals((error as { code?: string }).code, expectedCode);
    return;
  }
  throw new Error(`Expected error ${expectedCode}`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
