import {
  createStudentProfileApiCall,
  createStudentProfileFetchRequest
} from "./student-profile-api-call.js";

const DEFAULT_CLASSROOM_API_BASE = "/functions/v1/classroom-api";

function normalizedBase(value) {
  return String(value || DEFAULT_CLASSROOM_API_BASE).trim().replace(/\/+$/, "");
}

function isClassroomApiBase(value) {
  const base = normalizedBase(value);
  return base === DEFAULT_CLASSROOM_API_BASE || base.endsWith(DEFAULT_CLASSROOM_API_BASE);
}

export function installStudentProfileRuntime(config, { fetchImpl = globalThis.fetch } = {}) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new TypeError("A Player Terminal configuration object is required.");
  }
  if (config.usePreviewData === true || config.studentProfileMode === false) return config;
  if (config.apiCall || config.adapter) return config;
  if (typeof fetchImpl !== "function") {
    throw new TypeError("Student-Profile connected mode requires a fetch implementation.");
  }

  const apiBaseUrl = normalizedBase(config.studentProfileApiBaseUrl || DEFAULT_CLASSROOM_API_BASE);
  if (!isClassroomApiBase(apiBaseUrl)) {
    throw new TypeError("Student-Profile connected mode must use /functions/v1/classroom-api.");
  }

  const request = createStudentProfileFetchRequest({ apiBaseUrl, fetchImpl });
  return {
    ...config,
    apiBaseUrl,
    studentProfileMode: true,
    apiCall: createStudentProfileApiCall({ request }),
    adapter: null
  };
}

export const STUDENT_PROFILE_CLASSROOM_API_BASE = DEFAULT_CLASSROOM_API_BASE;
