import { mountAdminV2 } from "./app.js";
import { attachAdminShellUx } from "./shell-ux-enhancements.js";

const mount = document.getElementById("adminPreview");
let application = null;
let shellUx = null;

function showSafeBootFailure() {
  window.EconovariaAdminSessionGate?.showError(
    "The administrator console could not start. Reload this page or return to sign in.",
  );
}

function redirectToSignIn(reason) {
  const destination = new URL("../", window.location.href);
  destination.searchParams.set("mode", "admin");
  destination.searchParams.set("reason", reason);
  window.location.replace(destination.href);
}

async function attach() {
  const sessionManager = window.EconovariaAdminAuthSession;
  if (!mount || !sessionManager || typeof sessionManager.refresh !== "function") {
    showSafeBootFailure();
    return;
  }

  // Force a fresh HttpOnly session/status and authorization bootstrap on every
  // document load. The Admin mount remains hidden until this completes.
  let session;
  try {
    session = await sessionManager.refresh();
  } catch (_error) {
    showSafeBootFailure();
    return;
  }
  if (!session) {
    redirectToSignIn("session-required");
    return;
  }

  const selectedGameId = String(window.EconovariaAdminGameSelection?.read?.() || "").trim();
  if (!selectedGameId) {
    redirectToSignIn("select-game");
    return;
  }

  const compositionRoot = document.createElement("div");
  compositionRoot.dataset.adminV2CompositionRoot = "";
  try {
    application = mountAdminV2({ mount: compositionRoot, session, selectedGameId });
    mount.replaceChildren(compositionRoot);
    try {
      shellUx = attachAdminShellUx({ mount: compositionRoot, session, selectedGameId });
    } catch (_error) {
      // Shell affordance enhancements are progressive. A failure here must not
      // take the authenticated administrator route surface offline.
      shellUx = null;
    }
    mount.hidden = false;
    window.EconovariaAdminSessionGate?.release({ route: "Overview", initial: true });
  } catch (_error) {
    shellUx?.destroy?.();
    shellUx = null;
    application?.destroy?.();
    application = null;
    compositionRoot.remove();
    showSafeBootFailure();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", attach, { once: true });
} else {
  attach();
}
