(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const profile = app.modules.profile = app.modules.profile || {};

  function normalizeKey(key) {
    return String(key || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function pick(row, keys) {
    if (typeof global.pick === "function") {
      return global.pick(row, keys);
    }

    if (!row) return "";

    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
        return row[key];
      }
    }

    const normalizedMap = {};
    Object.keys(row).forEach(function (key) {
      normalizedMap[normalizeKey(key)] = row[key];
    });

    for (let index = 0; index < keys.length; index += 1) {
      const normalized = normalizeKey(keys[index]);
      if (
        normalizedMap[normalized] !== undefined &&
        normalizedMap[normalized] !== null &&
        normalizedMap[normalized] !== ""
      ) {
        return normalizedMap[normalized];
      }
    }

    return "";
  }

  function toDisplayNumber(value) {
    if (app.modules.numbers && typeof app.modules.numbers.toDisplayNumber === "function") {
      return app.modules.numbers.toDisplayNumber(value);
    }

    if (typeof global.toNumber === "function") {
      return global.toNumber(value);
    }

    const number = Number(String(value ?? "").replace(/[$,%]/g, "").trim());
    return Number.isFinite(number) ? number : 0;
  }

  // display-only
  function normalizeProfile(row) {
    if (!row) return null;

    return {
      raw: row,
      id: pick(row, ["id", "ID", "studentId", "Student_ID", "Student ID"]),
      cardId: pick(row, ["cardId", "Card_ID", "Card ID", "Code", "code"]),
      name: pick(row, ["name", "studentName", "Student_Name", "Student Name", "Name"]),
      grade: pick(row, ["grade", "Grade"]),
      homeroom: pick(row, ["homeroom", "Homeroom", "Class", "class"]),
      jobTitle: pick(row, ["jobTitle", "Job_Title", "Job Title", "Job", "job"]),
      balance: toDisplayNumber(pick(row, ["balance", "Balance", "Current_Balance", "Current Balance"])),
      active: pick(row, ["active", "Active", "Status", "status"]) || "Active"
    };
  }

  profile.normalizerStatus = "extracted";
  profile.normalizeProfile = normalizeProfile;

  app.modules.profileNormalizers = {
    status: "extracted",
    normalizeProfile
  };
})(window);
