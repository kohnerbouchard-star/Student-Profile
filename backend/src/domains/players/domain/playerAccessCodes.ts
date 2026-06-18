import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";

export function normalizeStudentCode(value: string): string {
  const normalizedValue = value
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();

  if (!normalizedValue) {
    throw new EdgeActivationError(
      "student_code_required",
      "studentCode is required.",
      400,
    );
  }

  if (!/^[A-Z0-9-]+$/.test(normalizedValue)) {
    throw new EdgeActivationError(
      "invalid_student_code",
      "studentCode may only contain letters, numbers, and hyphens.",
      400,
    );
  }

  return normalizedValue;
}
