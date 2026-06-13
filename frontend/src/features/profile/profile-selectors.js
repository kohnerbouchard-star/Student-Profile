(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const profile = app.modules.profile = app.modules.profile || {};

  function getState(sourceState) {
    return sourceState || global.state || {};
  }

  // display-only
  function getProfileData(sourceState) {
    const row = getState(sourceState).profile || null;

    if (typeof profile.normalizeProfile === "function") {
      return profile.normalizeProfile(row);
    }

    return row;
  }

  // display-only
  function getProfileDisplayRows(sourceState) {
    const data = getProfileData(sourceState);

    if (!data) return [];

    return [
      { label: "Name", value: data.name || "Unavailable" },
      { label: "Grade", value: data.grade || "Unavailable" },
      { label: "Homeroom", value: data.homeroom || "Unavailable" },
      { label: "Job", value: data.jobTitle || "No job assigned" },
      { label: "Account", value: data.active || "Active" }
    ];
  }

  profile.selectorStatus = "extracted";
  profile.getProfileData = getProfileData;
  profile.getProfileDisplayRows = getProfileDisplayRows;

  app.modules.profileSelectors = {
    status: "extracted",
    getProfileData,
    getProfileDisplayRows
  };
})(window);
