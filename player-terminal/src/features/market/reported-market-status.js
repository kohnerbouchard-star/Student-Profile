import { isResourceReady } from "../../api/resource-status.js";

// Only the Dashboard reports exchange state. The directory's status can lag
// when Market and Dashboard complete independently in one refresh batch.
export function reportedMarketStatus(data, config) {
  const dashboardStatus = data?.dashboard?.reportedMarketStatus;
  if (isResourceReady(data, "dashboard") && (dashboardStatus === "OPEN" || dashboardStatus === "CLOSED")) {
    return dashboardStatus;
  }
  const previewStatus = data?.market?.status;
  return config?.usePreviewData === true && (previewStatus === "OPEN" || previewStatus === "CLOSED")
    ? previewStatus
    : null;
}
