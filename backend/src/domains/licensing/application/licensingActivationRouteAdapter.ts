import {
  mapLicensingActivationError,
} from "./licensingActivationErrors";
import {
  redeemPurchaseCode,
  type RedeemPurchaseCodeDependencies,
} from "./redeemPurchaseCode";
import {
  buildLicensingActivationErrorResponse,
  buildLicensingActivationSuccessResponse,
  prepareLicensingActivationServiceInput,
  type LicensingActivationContractDependencies,
  type LicensingActivationResponse,
  type LicensingActivationRouteContext,
} from "../contracts/activationContract";
import {
  parseLicensingActivationRequestBody,
} from "../contracts/activationRequestParser";

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
