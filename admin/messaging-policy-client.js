function clean(value) { return String(value ?? "").trim(); }
function base() { return clean(document.querySelector('meta[name="econovaria-admin-api-base"]')?.content).replace(/\/+$/, ""); }
function auth() {
  const manager = window.AdminAuthSessionManager;
  const session = manager?.getSession?.() || manager?.session || null;
  const token = clean(session?.access_token || session?.accessToken || manager?.getAccessToken?.());
  return token ? { authorization: `Bearer ${token}` } : {};
}
async function request(path, init = {}) {
  const apiBase = base();
  if (!apiBase) throw new Error("Admin API base is not configured.");
  const response = await fetch(`${apiBase}${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers: { accept: "application/json", "content-type": "application/json", ...auth(), ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(clean(body.message || body.error?.message) || "Messaging policy request failed.");
    error.status = response.status;
    error.code = clean(body.code || body.error?.code);
    throw error;
  }
  const policy = body.data?.policy;
  if (!policy || policy.attachmentsEnabled !== false) throw new Error("Messaging policy response is invalid.");
  return Object.freeze({
    playerThreadsEnabled: policy.playerThreadsEnabled !== false,
    maxParticipants: Number(policy.maxParticipants || 2),
    defaultRetentionDays: Number(policy.defaultRetentionDays || 365),
    attachmentsEnabled: false,
    updatedAt: policy.updatedAt || null,
  });
}
export function createMessagingPolicyClient(gameId) {
  const root = `/games/${encodeURIComponent(clean(gameId))}/messages/policy`;
  return Object.freeze({
    read: () => request(root, { method: "GET" }),
    update: (policy) => request(root, {
      method: "POST",
      body: JSON.stringify({
        playerThreadsEnabled: policy.playerThreadsEnabled === true,
        defaultRetentionDays: Number(policy.defaultRetentionDays),
      }),
    }),
  });
}
