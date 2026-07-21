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
      question("work-style", "Which kind of first task sounds most satisfying?", [
        option("compare", "Compare information and identify a pattern.", { analyst: 3, trader: 1 }),
        option("organize", "Organize people and resources into a working plan.", { operator: 3, steward: 1 }),
        option("build", "Build or repair something useful.", { builder: 3, maker: 2 }),
        option("connect", "Help two groups reach a workable agreement.", { mediator: 3, navigator: 1 }),
      ]),
      question("uncertainty", "When conditions change quickly, what do you do first?", [
        option("measure", "Measure what changed before acting.", { analyst: 3, steward: 1 }),
        option("route", "Find an alternate route or source.", { navigator: 3, trader: 2 }),
        option("stabilize", "Stabilize the immediate operation.", { operator: 3, builder: 1 }),
        option("coordinate", "Coordinate the people affected.", { mediator: 3, steward: 2 }),
      ]),
      question("value", "Where do you most often notice value?", [
        option("price", "Differences in prices, timing, or demand.", { trader: 3, analyst: 2 }),
        option("process", "A process that can be made more reliable.", { operator: 3, builder: 1 }),
        option("materials", "Materials that can be reused or transformed.", { maker: 3, builder: 2 }),
        option("trust", "Trust that can make cooperation possible.", { mediator: 3, steward: 2 }),
      ]),
      question("environment", "Which environment would you learn fastest in?", [
        option("workshop", "A workshop with tools and prototypes.", { maker: 3, builder: 2 }),
        option("exchange", "A busy exchange with changing opportunities.", { trader: 3, navigator: 1 }),
        option("control", "An operations center with clear responsibilities.", { operator: 3, analyst: 1 }),
        option("community", "A community hub serving different needs.", { steward: 3, mediator: 2 }),
      ]),
      question("problem", "A route closes unexpectedly. What is your strongest contribution?", [
        option("model", "Estimate the effects and likely duration.", { analyst: 3, navigator: 1 }),
        option("alternate", "Identify practical alternate routes.", { navigator: 3, trader: 2 }),
        option("ration", "Allocate limited supplies fairly and transparently.", { steward: 3, mediator: 1 }),
        option("adapt", "Adapt equipment or production to local inputs.", { maker: 3, builder: 2 }),
      ]),
      question("team", "What role do you naturally take in a new team?", [
        option("planner", "Turn the objective into ordered steps.", { operator: 3, analyst: 1 }),
        option("craft", "Make the first workable version.", { builder: 3, maker: 2 }),
        option("bridge", "Translate concerns and keep cooperation moving.", { mediator: 3, steward: 1 }),
        option("scout", "Find resources, contacts, and routes.", { navigator: 3, trader: 2 }),
      ]),
      question("success", "Which result feels most meaningful?", [
        option("insight", "A decision becomes clearer because of evidence.", { analyst: 3, operator: 1 }),
        option("resilience", "A system keeps working under stress.", { builder: 3, steward: 2 }),
        option("exchange", "Both sides gain from a well-timed exchange.", { trader: 3, mediator: 1 }),
        option("access", "People regain access to an essential service.", { steward: 3, navigator: 1 }),
      ]),
      question("learning", "How do you prefer to learn a new economy?", [
        option("data", "Study indicators and test a model.", { analyst: 3, trader: 1 }),
        option("practice", "Operate a real process and improve it.", { operator: 3, builder: 2 }),
        option("experiment", "Experiment with materials and techniques.", { maker: 3, builder: 1 }),
        option("people", "Learn how institutions and communities coordinate.", { mediator: 3, steward: 2 }),
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

  const answerByQuestion = new Map<string, string>();
  for (const answer of answers) {
    if (answerByQuestion.has(answer.questionId)) {
      throw new ArrivalClassError(
        "arrival_answer_invalid",
        `Question ${answer.questionId} was answered more than once.`,
        false,
      );
    }
    answerByQuestion.set(answer.questionId, answer.optionId);
  }

  const contributions = new Map<ArrivalClassId, ArrivalClassScoreContribution[]>();
  for (const classId of ARRIVAL_CLASS_IDS) contributions.set(classId, []);

  for (const question of definition.questions) {
    const optionId = answerByQuestion.get(question.questionId);
    if (!optionId) {
      throw new ArrivalClassError(
        "arrival_answers_incomplete",
        `Question ${question.questionId} is unanswered.`,
        false,
      );
    }
    const selected = question.options.find((option) => option.optionId === optionId);
    if (!selected) {
      throw new ArrivalClassError(
        "arrival_answer_invalid",
        `Option ${optionId} does not belong to question ${question.questionId}.`,
        false,
      );
    }
    for (const classId of ARRIVAL_CLASS_IDS) {
      contributions.get(classId)?.push(Object.freeze({
        questionId: question.questionId,
        optionId,
        points: selected.scores[classId] ?? 0,
      }));
    }
  }

  const scores: ArrivalClassScore[] = ARRIVAL_CLASS_IDS.map((classId) => {
    const classContributions = Object.freeze(contributions.get(classId) ?? []);
    return Object.freeze({
      classId,
      total: classContributions.reduce((total, item) => total + item.points, 0),
      contributions: classContributions,
    });
  });
  const ranked = [...scores].sort((left, right) =>
    right.total - left.total ||
    ARRIVAL_CLASS_IDS.indexOf(left.classId) - ARRIVAL_CLASS_IDS.indexOf(right.classId)
  );
  const selectedClassId = ranked[0]?.classId;
  if (!selectedClassId) {
    throw new ArrivalClassError(
      "arrival_questionnaire_invalid",
      "Questionnaire produced no class result.",
      false,
    );
  }

  return Object.freeze({
    questionnaireId: definition.questionnaireId,
    questionnaireVersion: definition.version,
    selectedClassId,
    scores: Object.freeze(scores),
    tieBreakOrder: ARRIVAL_CLASS_IDS,
    explanation: `Selected ${selectedClassId} by highest total score; equal totals use the published class order.`,
  });
}

export function createArrivalClassAssignment(input: {
  readonly assignmentId: string;
  readonly gameId: string;
  readonly gameSessionId: string;
  readonly playerUuid: string;
  readonly scoreResult: ArrivalClassScoreResult;
  readonly assignedAt: string;
}): ArrivalClassAssignment {
  requireScope(input.gameId, input.gameSessionId, input.playerUuid);
  requireIsoDate(input.assignedAt);
  return Object.freeze({
    assignmentId: input.assignmentId,
    gameId: input.gameId,
    gameSessionId: input.gameSessionId,
    playerUuid: input.playerUuid,
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
      "Arrival assignment changed before the override was applied.",
      true,
    );
  }
  if (!ARRIVAL_CLASS_IDS.includes(input.classId) || input.reason.trim().length < 12) {
    throw new ArrivalClassError(
      "arrival_override_invalid",
      "Overrides require a valid class and a reviewable reason.",
      false,
    );
  }
  requireIsoDate(input.changedAt);
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
      input.arrivalPackageDefinitionId,
      input.grantDefinitionId,
    ].join(":"),
    gameId: input.assignment.gameId,
    gameSessionId: input.assignment.gameSessionId,
    playerUuid: input.assignment.playerUuid,
    classId: input.assignment.classId,
    arrivalPackageDefinitionId: input.arrivalPackageDefinitionId,
    grantDefinitionId: input.grantDefinitionId,
  });
}

function validateQuestionnaire(definition: ArrivalQuestionnaireDefinition): void {
  if (!definition.questionnaireId.trim() || !definition.version.trim()) {
    throw invalidQuestionnaire("Questionnaire identity and version are required.");
  }
  if (definition.questions.length < 6 || definition.questions.length > 8) {
    throw invalidQuestionnaire("Arrival questionnaires require six to eight questions.");
  }
  const questionIds = new Set<string>();
  for (const question of definition.questions) {
    if (!question.questionId.trim() || !question.prompt.trim() || questionIds.has(question.questionId)) {
      throw invalidQuestionnaire("Question identifiers and prompts must be unique and nonempty.");
    }
    questionIds.add(question.questionId);
    if (question.options.length < 2 || question.options.length > 5) {
      throw invalidQuestionnaire(`Question ${question.questionId} has an invalid option count.`);
    }
    const optionIds = new Set<string>();
    for (const option of question.options) {
      if (!option.optionId.trim() || !option.label.trim() || optionIds.has(option.optionId)) {
        throw invalidQuestionnaire(`Question ${question.questionId} has an invalid option.`);
      }
      optionIds.add(option.optionId);
      const values = Object.values(option.scores);
      if (values.length === 0 || values.some((value) =>
        !Number.isInteger(value) || (value ?? 0) < 0 || (value ?? 0) > 3
      )) {
        throw invalidQuestionnaire(`Option ${option.optionId} has invalid score weights.`);
      }
    }
  }
}

function question(
  questionId: string,
  prompt: string,
  options: readonly ReturnType<typeof option>[],
) {
  return Object.freeze({ questionId, prompt, options: Object.freeze(options) });
}

function option(
  optionId: string,
  label: string,
  scores: Readonly<Partial<Record<ArrivalClassId, number>>>,
) {
  return Object.freeze({ optionId, label, scores: Object.freeze(scores) });
}

function invalidQuestionnaire(message: string): ArrivalClassError {
  return new ArrivalClassError("arrival_questionnaire_invalid", message, false);
}

function requireScope(gameId: string, gameSessionId: string, playerUuid: string): void {
  if (!gameId.trim() || !gameSessionId.trim() || !playerUuid.trim()) {
    throw new ArrivalClassError(
      "arrival_assignment_scope_mismatch",
      "Game, session, and player scope are required.",
      false,
    );
  }
}

function requireIsoDate(value: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new ArrivalClassError(
      "arrival_assignment_scope_mismatch",
      "Assignment timestamp must be valid.",
      false,
    );
  }
}
