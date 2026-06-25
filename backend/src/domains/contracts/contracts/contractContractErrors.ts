export type ContractContractErrorCode = "invalid_contract_contract";

export class ContractContractError extends Error {
  readonly code: ContractContractErrorCode;
  readonly status: number;

  constructor(
    code: ContractContractErrorCode,
    message: string,
    status = 400,
  ) {
    super(message);
    this.name = "ContractContractError";
    this.code = code;
    this.status = status;
  }
}

export function invalidContractContract(
  message: string,
): ContractContractError {
  return new ContractContractError(
    "invalid_contract_contract",
    message,
    400,
  );
}
