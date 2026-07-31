import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";

export type StaffSignupVerificationType = "signup" | "magiclink";

export interface StaffSignupSupabaseLink {
  readonly authUserId: string;
  readonly email: string;
  readonly tokenHash: string;
  readonly verificationType: StaffSignupVerificationType;
}

interface GenerateLinkResponse {
  readonly data: {
    readonly user?: {
      readonly id?: string;
      readonly email?: string | null;
    } | null;
    readonly properties?: {
      readonly hashed_token?: string;
      readonly verification_type?: string;
    } | null;
  };
  readonly error: { readonly message?: string } | null;
}

interface AdminGenerateLinkClient {
  generateLink(input:
    | {
      readonly type: "signup";
      readonly email: string;
      readonly password: string;
      readonly options?: {
        readonly data?: Record<string, unknown>;
      };
    }
    | {
      readonly type: "magiclink";
      readonly email: string;
    }
  ): PromiseLike<GenerateLinkResponse>;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TOKEN_HASH_PATTERN = /^[A-Za-z0-9_-]{16,256}$/u;

export async function generateInitialStaffSignupLink(
  serviceClient: EdgeSupabaseClient,
  input: {
    readonly email: string;
    readonly password: string;
    readonly displayName: string;
  },
): Promise<StaffSignupSupabaseLink | null> {
  return generateLink(serviceClient, {
    type: "signup",
    email: input.email,
    password: input.password,
    options: {
      data: {
        display_name: input.displayName,
        onboarding_source: "verified_staff_signup_v1",
      },
    },
  }, "signup");
}

export async function generatePendingStaffSignupResendLink(
  serviceClient: EdgeSupabaseClient,
  input: {
    readonly email: string;
    readonly expectedAuthUserId: string;
  },
): Promise<StaffSignupSupabaseLink | null> {
  const generated = await generateLink(serviceClient, {
    type: "magiclink",
    email: input.email,
  }, "magiclink");
  return generated?.authUserId === input.expectedAuthUserId ? generated : null;
}

async function generateLink(
  serviceClient: EdgeSupabaseClient,
  input: Parameters<AdminGenerateLinkClient["generateLink"]>[0],
  expectedType: StaffSignupVerificationType,
): Promise<StaffSignupSupabaseLink | null> {
  try {
    const response = await (serviceClient.auth.admin as unknown as AdminGenerateLinkClient)
      .generateLink(input);
    const userId = String(response.data.user?.id || "").trim().toLowerCase();
    const email = String(response.data.user?.email || "").trim().toLowerCase();
    const tokenHash = String(response.data.properties?.hashed_token || "").trim();
    const verificationType = String(
      response.data.properties?.verification_type || "",
    ).trim().toLowerCase();
    if (
      response.error ||
      !UUID_PATTERN.test(userId) ||
      email !== input.email.trim().toLowerCase() ||
      !TOKEN_HASH_PATTERN.test(tokenHash) ||
      verificationType !== expectedType
    ) {
      return null;
    }
    return {
      authUserId: userId,
      email,
      tokenHash,
      verificationType: expectedType,
    };
  } catch {
    return null;
  }
}
