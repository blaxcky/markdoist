// Config-Plugin: Release-Signatur aus Umgebungsvariablen (Plan 10.2).
// MARKDOIST_KEYSTORE (Pfad), MARKDOIST_KEYSTORE_PASSWORD, MARKDOIST_KEY_ALIAS, MARKDOIST_KEY_PASSWORD.
// Ohne MARKDOIST_KEYSTORE bleibt der Release-Build unsigniert und wird nie mit dem Debug-Schlüssel signiert.
const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// markdoist-release-signing";

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg;
    src = src.replace(
      /signingConfigs \{\n/,
      `signingConfigs {
        ${MARKER}
        if (System.getenv("MARKDOIST_KEYSTORE")) {
            release {
                storeFile file(System.getenv("MARKDOIST_KEYSTORE"))
                storePassword System.getenv("MARKDOIST_KEYSTORE_PASSWORD")
                keyAlias System.getenv("MARKDOIST_KEY_ALIAS")
                keyPassword System.getenv("MARKDOIST_KEY_PASSWORD")
            }
        }
`,
    );
    const re = /(release \{\n\s*\/\/ Caution![^\n]*\n\s*\/\/ see[^\n]*\n\s*)signingConfig signingConfigs\.debug/;
    if (!re.test(src)) throw new Error("withReleaseSigning: release-Block nicht gefunden");
    src = src.replace(
      re,
      `$1signingConfig System.getenv("MARKDOIST_KEYSTORE") ? signingConfigs.release : null`,
    );
    cfg.modResults.contents = src;
    return cfg;
  });
};
