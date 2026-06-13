// Ensures the student frontend can use the USE_ITEM action.
// app.js defines PERMISSION_SETS with const, so it is not available as window.PERMISSION_SETS.
// This patch uses the actual global lexical binding and also keeps current sessions compatible.

(function enableUseItemPermission() {
  try {
    if (typeof PERMISSION_SETS !== 'undefined' && PERMISSION_SETS.STUDENT) {
      if (!Array.isArray(PERMISSION_SETS.STUDENT.actions)) {
        PERMISSION_SETS.STUDENT.actions = [];
      }

      if (!PERMISSION_SETS.STUDENT.actions.includes('USE_ITEM')) {
        PERMISSION_SETS.STUDENT.actions.push('USE_ITEM');
      }
    }

    if (typeof can === 'function') {
      const originalCan = can;

      can = function patchedCan(action) {
        if (action === 'USE_ITEM') {
          if (typeof currentSession !== 'undefined' && currentSession && currentSession.role === 'STUDENT') {
            return true;
          }

          if (
            typeof PERMISSION_SETS !== 'undefined' &&
            PERMISSION_SETS.STUDENT &&
            Array.isArray(PERMISSION_SETS.STUDENT.actions) &&
            PERMISSION_SETS.STUDENT.actions.includes('USE_ITEM')
          ) {
            return true;
          }
        }

        return originalCan(action);
      };
    }

    if (typeof requirePermission === 'function') {
      const originalRequirePermission = requirePermission;

      requirePermission = function patchedRequirePermission(action) {
        if (action === 'USE_ITEM' && typeof can === 'function' && can(action)) {
          return true;
        }

        return originalRequirePermission(action);
      };
    }
  } catch (err) {
    console.warn('USE_ITEM permission patch did not apply:', err);
  }
})();
