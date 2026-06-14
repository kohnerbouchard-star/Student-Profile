/*
 * Compatibility marker only.
 *
 * The active frontend runtime is loaded directly from index.html using the
 * split files under frontend/src/. This file is kept temporarily so older
 * references to app.js fail safely during the transition.
 */
window.Econovaria = window.Econovaria || {};
window.Econovaria.compat = window.Econovaria.compat || {};
window.Econovaria.compat.appJsSplit = true;
