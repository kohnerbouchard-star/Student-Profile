export const ARRIVAL_CLASS_IDS = [
  "analyst",
  "builder",
  "maker",
  "mediator",
  "navigator",
  "operator",
  "steward",
  "trader",
] as const;

export type ArrivalClassId = typeof ARRIVAL_CLASS_IDS[number];

export interface ArrivalQuestionOption {
  readonly optionId: string;
  readonly label: string;
  readonly scores: Readonly<Partial<Record<ArrivalClassId, number>>>;
}

export interface ArrivalQuestionDefinition {
  readonly questionId: string;
  readonly prompt: string;
  readonly options: readonly ArrivalQuestionOption[];
}

export interface ArrivalQuestionnaireDefinition {
  readonly questionnaireId: string;
  readonly version: string;
  readonly questions: readonly ArrivalQuestionDefinition[];
}

export interface ArrivalQuestionAnswer {
  readonly questionId: string;
  readonly optionId: string;
}

export interface ArrivalClassScoreContribution {
  readonly questionId: string;
  readonly optionId: string;
  readonly points: number;
}

export interface ArrivalClassScore {
  readonly classId: ArrivalClassId;
  readonly total: number;
  readonly contributions: readonly ArrivalClassScoreContribution[];
}

export interface ArrivalClassScoreResult {
  readonly questionnaireId: string;
  readonly questionnaireVersion: string;
  readonly selectedClassId: ArrivalClassId;
  readonly scores: readonly ArrivalClassScore[];
  readonly tieBreakOrder: readonly ArrivalClassId[];
  readonly explanation: string;
}

export interface ArrivalClassAssignment {
  readonly assignmentId: string;
  readonly gameId: string;
  readonly gameSessionId: string;
  readonly playerUuid: string;
  readonly countryId: string;
  readonly classId: ArrivalClassId;
  readonly source: "questionnaire" | "admin_override";
  readonly questionnaireId: string;
  readonly questionnaireVersion: string;
  readonly scoreResult: ArrivalClassScoreResult | null;
  readonly overrideReason: string | null;
  readonly revision: number;
  readonly assignedAt: string;
  readonly updatedAt: string;
  readonly economicRestrictions: readonly never[];
}

export interface ArrivalGrantCommand {
  readonly kind: "apply_arrival_grant";
  readonly idempotencyKey: string;
  readonly gameId: string;
  readonly gameSessionId: string;
  readonly playerUuid: string;
  readonly countryId: string;
  readonly classId: ArrivalClassId;
  readonly arrivalPackageDefinitionId: string;
  readonly grantDefinitionId: string;
}

export class ArrivalClassError extends Error {
  constructor(
    readonly code:
      | "arrival_questionnaire_invalid"
      | "arrival_answers_incomplete"
      | "arrival_answer_invalid"
      | "arrival_assignment_scope_mismatch"
      | "arrival_assignment_revision_conflict"
      | "arrival_override_invalid",
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ArrivalClassError";
  }
}
