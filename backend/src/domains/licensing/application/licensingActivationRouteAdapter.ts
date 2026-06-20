import {
  mapLicensingActivationError,
} from "./licensingActivationErrors.ts";
import {
  redeemPurchaseCode,
  type RedeemPurchaseCodeDependencies,
} from "./redeemPurchaseCode.ts";
import {
  buildLicensingActivationErrorResponse,
  buildLicensingActivationSuccessResponse,
  prepareLicensingActivationServiceInput,
  type LicensingActivationContractDependencies,
  type LicensingActivationResponse,
  type LicensingActivationRouteContext,
} from "../contracts/activationContract.ts";
import {
  parseLicensingActivationRequestBody,
} from "../contracts/activationRequestParser.ts";

export interface LicensingActivationRouteAdapterDependencies
  extends LicensingActivationContractDependencies {
  readonly redeemPurchaseCodeDependencies: RedeemPurchaseCodeDependencies;
}

export interface LicensingActivationRouteAdapterResult {
  readonly httpStatus: number;
  readonly body: LicensingActivationResponse;
}

export async function handleLicensingActivationRequest(
  body: unknown,
  context: LicensingActivationRouteContext,
  dependencies: LicensingActivationRouteAdapterDependencies,
): Promise<LicensingActivationRouteAdapterResult> {
  try {
    const parsedBody = parseLicensingActivationRequestBody(body);
    const serviceInput = await prepareLicensingActivationServiceInput(
      parsedBody,
      context,
      dependencies,
    );

    const result = await redeemPurchaseCode(
      serviceInput,
      dependencies.redeemPurchaseCodeDependencies,
    );

    return {
      httpStatus: 200,
      body: buildLicensingActivationSuccessResponse(result),
    };
  } catch (error) {
    const safeError = mapLicensingActivationError(error);

    return {
      httpStatus: safeError.httpStatus,
      body: buildLicensingActivationErrorResponse(safeError),
    };
  }
}
