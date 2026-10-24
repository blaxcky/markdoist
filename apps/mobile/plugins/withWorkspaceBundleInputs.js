// Config-Plugin: Der Release-Bundle-Task des React-Native-Gradle-Plugins beobachtet nur Dateien
// unter apps/mobile und schließt node_modules aus. Änderungen an den Workspace-Paketen
// (packages/core, packages/app) und am rrule-Patch erkannte Gradle deshalb nicht und meldete
// createBundleReleaseJsAndAssets als UP-TO-DATE mit altem Bundle (Review Wiederholungen 23.10.2026).
// Hier werden diese Quellen zusätzlich als Task-Inputs registriert.
const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// markdoist-workspace-bundle-inputs";

const SNIPPET = `
${MARKER}
// Workspace-Quellen als Inputs der Bundle-Tasks (apps/mobile/plugins/withWorkspaceBundleInputs.js).
tasks.configureEach { t ->
    if (t.name.startsWith("createBundle") && t.name.endsWith("JsAndAssets")) {
        def repoRoot = new File(projectRoot, "../..").canonicalFile
        [packagesCore: "packages/core/src", packagesApp: "packages/app/src", patches: "patches"].each { key, rel ->
            t.inputs.dir(new File(repoRoot, rel))
                .withPropertyName("markdoistWorkspace_" + key)
                .withPathSensitivity(PathSensitivity.RELATIVE)
        }
        t.inputs.file(new File(repoRoot, "pnpm-lock.yaml"))
            .withPropertyName("markdoistWorkspace_lockfile")
            .withPathSensitivity(PathSensitivity.NONE)
    }
}
`;

function addWorkspaceInputs(src) {
  if (src.includes(MARKER)) return src;
  if (!/def projectRoot = /.test(src))
    throw new Error("withWorkspaceBundleInputs: projectRoot in app/build.gradle nicht gefunden");
  return src.trimEnd() + "\n" + SNIPPET;
}

module.exports = function withWorkspaceBundleInputs(config) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = addWorkspaceInputs(cfg.modResults.contents);
    return cfg;
  });
};
module.exports.addWorkspaceInputs = addWorkspaceInputs;
