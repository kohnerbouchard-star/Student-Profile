import {
  ARRIVAL_CLASS_IDS,
  type ArrivalClassAssignment,
  ArrivalClassError,
  type ArrivalClassId,
  type ArrivalClassScore,
  type ArrivalClassScoreContribution,
  type ArrivalClassScoreResult,
  type ArrivalGrantCommand,
  type ArrivalQuestionAnswer,
  type ArrivalQuestionnaireDefinition,
} from "../contracts/arrivalClassContracts.ts";

export const DEFAULT_ARRIVAL_QUESTIONNAIRE: ArrivalQuestionnaireDefinition =
  Object.freeze({
    questionnaireId: "arrival-class-balanced-v1",
    version: "1.0.0",
    questions: Object.freeze([
      q("work", "Which first task sounds most satisfying?", [
        o("compare", "Compare information and identify a pattern.", { analyst: 3, trader: 1 }),
        o("organize", "Organize people and resources.", { operator: 3, steward: 1 }),
        o("build", "Build or repair something useful.", { builder: 3, maker: 2 }),
        o("connect", "Help groups reach an agreement.", { mediator: 3, navigator: 1 }),
      ]),
      q("change", "When conditions change quickly, what comes first?", [
        o("measure", "Measure what changed.", { analyst: 3, steward: 1 }),
        o("route", "Find an alternate route or source.", { navigator: 3, trader: 2 }),
        o("stabilize", "Stabilize the operation.", { operator: 3, builder: 1 }),
        o("coordinate", "Coordinate the people affected.", { mediator: 3, steward: 2 }),
      ]),
      q("value", "Where do you most often notice value?", [
        o("price", "Prices, timing, or demand.", { trader: 3, analyst: 2 }),
        o("process", "A process that can be more reliable.", { operator: 3, builder: 1 }),
        o("materials", "Materials that can be transformed.", { maker: 3, builder: 2 }),
        o("trust", "Trust that enables cooperation.", { mediator: 3, steward: 2 }),
      ]),
      q("place", "Where would you learn fastest?", [
        o("workshop", "A workshop with tools and prototypes.", { maker: 3, builder: 2 }),
        o("exchange", "A busy exchange with changing opportunities.", { trader: 3, navigator: 1 }),
        o("control", "An operations center.", { operator: 3, analyst: 1 }),
        o("community", "A community service hub.", { steward: 3, mediator: 2 }),
      ]),
      q("closure", "A route closes. What is your strongest contribution?", [
        o("model", "Estimate effects and duration.", { analyst: 3, navigator: 1 }),
        o("alternate", "Identify alternate routes.", { navigator: 3, trader: 2 }),
        o("ration", "Allocate limited supplies fairly.", { steward: 3, mediator: 1 }),
        o("adapt", "Adapt production to local inputs.", { maker: 3, builder: 2 }),
      ]),
      q("team", "What role do you take in a new team?", [
        o("planner", "Turn objectives into steps.", { operator: 3, analyst: 1 }),
        o("craft", "Make the first workable version.", { builder: 3, maker: 2 }),
        o("bridge", "Translate concerns and maintain cooperation.", { mediator: 3, steward: 1 }),
        o("scout", "Find resources, contacts, and routes.", { navigator: 3, trader: 2 }),
      ]),
      q("result", "Which result feels most meaningful?", [
        o("insight", "Evidence makes a decision clearer.", { analyst: 3, operator: 1 }),
        o("resilience", "A system keeps working under stress.", { builder: 3, steward: 2 }),
        o("exchange", "Both sides gain from an exchange.", { trader: 3, mediator: 1 }),
        o("access", "People regain an essential service.", { steward: 3, navigator: 1 }),
      ]),
      q("learning", "How do you learn a new economy?", [
        o("data", "Study indicators and test a model.", { analyst: 3, trader: 1 }),
        o("practice", "Operate and improve a process.", { operator: 3, builder: 2 }),
        o("experiment", "Experiment with materials.", { maker: 3, builder: 1 }),
        o("people", "Learn how institutions coordinate.", { mediator: 3, steward: 2 }),
      ]),
    ]),
  });

export function scoreArrivalQuestionnaire(
  definition: ArrivalQuestionnaireDefinition,
  answers: readonly ArrivalQuestionAnswer[],
): ArrivalClassScoreResult {
  validateQuestionnaire(definition);
  if (answers.length !== definition.questions.length) {
    throw new ArrivalClassError(
      "arrival_answers_incomplete",
      `Expected ${definition.questions.length} answers and received ${answers.length}.`,
      false,
    );
  }
  const answerMap = new Map<string, string>();
  for (const answer of answers) {
    if (answerMap.has(answer.questionId)) {
      throw new ArrivalClassError(
        "arrival_answer_invalid",
        `Question ${answer.questionId} was answered more than once.`,
        false,
      );
    }
    answerMap.set(answer.questionId, answer.optionId);
  }
  const byClass = new Map<ArrivalClassId, ArrivalClassScoreContribution[]>();
  for (const classId of ARRIVAL_CLASS_IDS) byClass.set(classId, []);
  for (const question of definition.questions) {
    const optionId = answerMap.get(question.questionId);
    const selected = question.options.find((item) => item.optionId === optionId);
    if (!optionId || !selected) {
      throw new ArrivalClassError(
        optionId ? "arrival_answer_invalid" : "arrival_answers_incomplete",
        `Question ${question.questionId} has no valid answer.`,
        false,
      );
    }
    for (const classId of ARRIVAL_CLASS_IDS) {
      byClass.get(classId)?.push(Object.freeze({
        questionId: question.questionId,
        optionId,
        points: selected.scores[classId] ?? 0,
      }));
    }
  }
  const scores: ArrivalClassScore[] = ARRIVAL_CLASS_IDS.map((classId) => {
    const contributions = Object.freeze(byClass.get(classId) ?? []);
    return Object.freeze({
      classId,
      total: contributions.reduce((sum, item) => sum + item.points, 0),
      contributions,
    });
  });
  const ranked = [...scores].sort((left, right) =>
    right.total - left.total ||
    ARRIVAL_CLASS_IDS.indexOf(left.classId) - ARRIVAL_CLASS_IDS.indexOf(right.classId)
  );
  const selectedClassId = ranked[0]?.classId;
  if (!selectedClassId) throw invalid("Questionnaire produced no class result.");
  return Object.freeze({
    questionnaireId: definition.questionnaireId,
    questionnaireVersion: definition.version,
    version: definition.version,
    selectedClassId,
    scores: Object.freeze(scores),
    tieBreakOrder: ARRIVAL_CLASS_IDS,
    explanation: `Selected ${selectedClassId} by highest score; equal scores use the published class order.`,
  });
}

export function createArrivalClassAssignment(input: {
  readonly assignmentId: string;
  readonly gameId: string;
  readonly gameSessionId: string;
  readonly playerUuid: string;
  readonly countryId: string;
  readonly scoreResult: ArrivalClassScoreResult;
  readonly assignedAt: string;
}): ArrivalClassAssignment {
  requireScope(input.gameId, input.gameSessionId, input.playerUuid, input.countryId);
  requireDate(input.assignedAt);
  return Object.freeze({
    assignmentId: input.assignmentId,
    gameId: input.gameId,
    gameSessionId: input.gameSessionId,
    playerUuid: input.playerUuid,
    countryId: input.countryId,
    classId: input.scoreResult.selectedClassId,
    source: "questionnaire",
    questionnaireId: input.scoreResult.questionnaireId,
    questionnaireVersion: input.scoreResult.questionnaireVersion,
    scoreResult: input.scoreResult,
    overrideReason: null,
    revision: 0,
    assignedAt: input.assignedAt,
    updatedAt: input.assignedAt,
    economicRestrictions: Object.freeze([]),
  });
}

export function overrideArrivalClassAssignment(
  assignment: ArrivalClassAssignment,
  input: {
    readonly gameId: string;
    readonly expectedRevision: number;
    readonly classId: ArrivalClassId;
    readonly reason: string;
    readonly changedAt: string;
  },
): ArrivalClassAssignment {
  if (input.gameId !== assignment.gameId) {
    throw new ArrivalClassError(
      "arrival_assignment_scope_mismatch",
      "Arrival assignment belongs to another game.",
      false,
    );
  }
  if (input.expectedRevision !== assignment.revision) {
    throw new ArrivalClassError(
      "arrival_assignment_revision_conflict",
      "Arrival assignment changed before the override.",
      true,
    );
  }
  if (!ARRIVAL_CLASS_IDS.includes(input.classId) || input.reason.trim().length < 12) {
    throw new ArrivalClassError(
      "arrival_override_invalid",
      "Overrides require a valid class and reviewable reason.",
      false,
    );
  }
  requireDate(input.changedAt);
  return Object.freeze({
    ...assignment,
    classId: input.classId,
    source: "admin_override",
    overrideReason: input.reason.trim(),
    revision: assignment.revision + 1,
    updatedAt: input.changedAt,
    economicRestrictions: Object.freeze([]),
  });
}

export function buildArrivalGrantCommand(input: {
  readonly assignment: ArrivalClassAssignment;
  readonly arrivalPackageDefinitionId: string;
  readonly grantDefinitionId: string;
}): ArrivalGrantCommand {
  if (!input.arrivalPackageDefinitionId.trim() || !input.grantDefinitionId.trim()) {
    throw new ArrivalClassError(
      "arrival_assignment_scope_mismatch",
      "Versioned arrival package and grant definitions are required.",
      false,
    );
  }
  return Object.freeze({
    kind: "apply_arrival_grant",
    idempotencyKey: [
      "arrival-grant",
      input.assignment.gameSessionId,
      input.assignment.playerUuid,
      input.assignment.countryId,
      input.arrivalPackageDefinitionId,
      input.grantDefinitionId,
    ].join(":"),
    gameId: input.assignment.gameId,
    gameSessionId: input.assignment.gameSessionId,
    playerUuid: input.assignment.playerUuid,
    countryId: input.assignment.countryId,
    classId: input.assignment.classId,
    arrivalPackageDefinitionId: input.arrivalPackageDefinitionId,
    grantDefinitionId: input.grantDefinitionId,
  });
}

function validateQuestionnaire(definition: ArrivalQuestionnaireDefinition): void {
  if (!definition.questionnaireId.trim() || !definition.version.trim()) {
    throw invalid("Questionnaire identity and version are required.");
  }
  if (definition.questions.length < 6 || definition.questions.length > 8) {
    throw invalid("Arrival questionnaires require six to eight questions.");
  }
  const questionIds = new Set<string>();
  for (const question of definition.questions) {
    if (!question.questionId.trim() || !question.prompt.trim() || questionIds.has(question.questionId)) {
      throw invalid("Question identifiers and prompts must be unique and nonempty.");
    }
    questionIds.add(question.questionId);
    const optionIds = new Set<string>();
    if (question.options.length < 2 || question.options.length > 5) {
      throw invalid(`Question ${question.questionId} has an invalid option count.`);
    }
    for (const option of question.options) {
      if (!option.optionId.trim() || !option.label.trim() || optionIds.has(option.optionId)) {
        throw invalid(`Question ${question.questionId} has an invalid option.`);
      }
      optionIds.add(option.optionId);
      const values = Object.values(option.scores);
      if (values.length === 0 || values.some((value) =>
        !Number.isInteger(value) || value < 0 || value > 3
      )) {
        throw invalid(`Option ${option.optionId} has invalid score weights.`);
      }
    }
  }
}

function q(questionId: string, prompt: string, options: readonly ReturnType<typeof o>[]) {
  return Object.freeze({ questionId, prompt, options: Object.freeze(options) });
}

function o(
  optionId: string,
  label: string,
  scores: Readonly<Partial<Record<ArrivalClassId, number>>>,
) {
  return Object.freeze({ optionId, label, scores: Object.freeze(scores) });
}

function invalid(message: string): ArrivalClassError {
  return new ArrivalClassError("arrival_questionnaire_invalid", message, false);
}

function requireScope(...values: readonly string[]): void {
  if (values.some((value) => !value.trim())) {
    throw new ArrivalClassError(
      "arrival_assignment_scope_mismatch",
      "Game, session, player, and country scope are required.",
      false,
    );
  }
}

function requireDate(value: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new ArrivalClassError(
      "arrival_assignment_scope_mismatch",
      "Assignment timestamp must be valid.",
      false,
    );
  }
}
