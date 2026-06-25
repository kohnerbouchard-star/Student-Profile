export type StorylineContractErrorCode = "invalid_storyline_contract";

export class StorylineContractError extends Error {
  readonly code: StorylineContractErrorCode;
  readonly status: number;

  constructor(
    code: StorylineContractErrorCode,
    message: string,
    status = 400,
  ) {
    super(message);
    this.name = "StorylineContractError";
    this.code = code;
    this.status = status;
  }
}

export function invalidStorylineContract(
  message: string,
): StorylineContractError {
  return new StorylineContractError(
    "invalid_storyline_contract",
    message,
    400,
  );
}
