// The Settings negative source probe must inspect every installed owner, not just
// the facade. Missing responses fail closed before any source assertion runs.
export const settingsPresenterSourceFiles = Object.freeze([
  "settings-copy.js",
  "settings-presentation.js",
  "settings-simplified.js",
]);

export async function readSettingsPresenterSource(request, baseUrl) {
  const sources = await Promise.all(settingsPresenterSourceFiles.map(async (file) => {
    const response = await request.get(`${baseUrl}/${file}`);
    if (!response.ok()) throw new Error(`Missing Settings presenter source: ${file}`);
    return response.text();
  }));
  return sources.join("\n");
}
