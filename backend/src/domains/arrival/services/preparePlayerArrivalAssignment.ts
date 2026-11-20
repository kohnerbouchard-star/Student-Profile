import type { ArrivalQuestionAnswer } from "../contracts/arrivalClassContracts.ts";
import {
  buildArrivalGrantCommand,
  createArrivalClassAssignment,
  DEFAULT_ARRIVAL_QUESTIONNAIRE,
  scoreArrivalQuestionnaire,
} from "./arrivalClassScoring.ts";

/** Prepare the Arrival-owned values for the caller's existing atomic write. */
export function preparePlayerArrivalAssignment(input: {
  readonly subject: {
    readonly scope: { readonly gameId: string; readonly playerUuid: string };
    readonly request: { readonly answers: readonly ArrivalQuestionAnswer[] };
  };
  readonly runtimeInput: {
    readonly countryId: string;
    readonly arrivalPackageDefinitionId: string;
    readonly classGrantDefinitionId: (classId: string) => string;
  };
  readonly now: () => string;
  readonly createAssignmentId: () => string;
}) {
  const scoreResult = scoreArrivalQuestionnaire(
    DEFAULT_ARRIVAL_QUESTIONNAIRE,
    input.subject.request.answers,
  );
  const now = input.now;
  const assignedAt = now();
  const assignment = createArrivalClassAssignment({
    assignmentId: input.createAssignmentId(),
    gameId: input.subject.scope.gameId,
    gameSessionId: input.subject.scope.gameId,
    playerUuid: input.subject.scope.playerUuid,
    countryId: input.runtimeInput.countryId,
    scoreResult,
    assignedAt,
  });
  const grant = buildArrivalGrantCommand({
    assignment,
    arrivalPackageDefinitionId: input.runtimeInput.arrivalPackageDefinitionId,
    grantDefinitionId: input.runtimeInput.classGrantDefinitionId(
      assignment.classId,
    ),
  });
  return { assignment, scoreResult, grant };
}
