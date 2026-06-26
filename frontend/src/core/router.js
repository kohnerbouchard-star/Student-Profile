window.Econovaria = window.Econovaria || {};
window.Econovaria.core = window.Econovaria.core || {};

function switchView(view) {
  if (!selectedStudent()) return showLogin();

  const role = currentSession?.role || "STUDENT";
  const allowedViews = PERMISSION_SETS[role]?.views || [];

  if (!allowedViews.includes(view)) {
    console.warn("[Econovaria router] Blocked view navigation.", { role, view });

    if (typeof showGlobalStatus === "function") {
      showGlobalStatus("bad", "That page is not available for your account right now.");
    }

    return;
  }

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });

  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active", section.id === view);
  });

  const copy = VIEW_COPY[view] || VIEW_COPY.profile;
  const pageTitleEl = document.getElementById("pageTitle");
  const pageSubtitleEl = document.getElementById("pageSubtitle");

  if (pageTitleEl) pageTitleEl.textContent = copy.title;
  if (pageSubtitleEl) pageSubtitleEl.textContent = copy.subtitle;

  renderCurrentView();
}

function currentView() {
  return document.querySelector(".view.active")?.id || "profile";
}

function renderCurrentView() {
  if (!selectedStudent()) return showLogin();

  const view = currentView();

  if (view === "profile") renderProfile();
  if (view === "store") renderStore();
  if (view === "portfolio") renderPortfolio();
  if (view === "trade") renderTrade();
  if (view === "stockProfile") renderStockProfile();
  if (view === "rating") renderRating();
}

Object.assign(window.Econovaria.core, { switchView, currentView, renderCurrentView });
