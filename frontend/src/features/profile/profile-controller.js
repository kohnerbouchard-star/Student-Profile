(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const profile = app.modules.profile = app.modules.profile || {};

  function testProfileModule(sourceState) {
    const state = sourceState || global.state || {};
    const profileData = typeof profile.getProfileData === "function" ? profile.getProfileData(state) : null;
    const rows = typeof profile.getProfileDisplayRows === "function" ? profile.getProfileDisplayRows(state) : [];
    const html = typeof profile.renderProfilePanel === "function" ? profile.renderProfilePanel({ state }) : "";
    const required = [
      "normalizeProfile",
      "getProfileData",
      "getProfileDisplayRows",
      "renderProfilePanel",
      "renderProfileHeader",
      "renderProfileStats",
      "renderProfileEmptyState"
    ];
    const missing = required.filter(function (name) {
      return typeof profile[name] !== "function";
    });

    return {
      ok: missing.length === 0,
      missing,
      profileAvailable: Boolean(profileData),
      profileName: profileData && profileData.name || "",
      profileCardId: profileData && (profileData.cardId || profileData.id) || "",
      displayedBalance: profileData ? profileData.balance : "",
      displayRowCount: rows.length,
      renderedPanelHasHeader: html.includes("profile-header"),
      renderedPanelHasStats: html.includes("profile-stats")
    };
  }

  profile.controllerStatus = "extracted";
  profile.testProfileModule = testProfileModule;

  app.modules.profileController = {
    status: "extracted",
    testProfileModule
  };
})(window);
