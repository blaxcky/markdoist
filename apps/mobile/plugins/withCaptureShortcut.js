// Config-Plugin: statische App-Verknüpfung „Neue Aufgabe“ (F009, Plan 2.2).
// Öffnet markdoist://capture; die Aufgabe landet wie jede Erfassung im Eingang.
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

function shortcutsXml(pkg) {
  return `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
  <shortcut
    android:shortcutId="capture"
    android:enabled="true"
    android:icon="@mipmap/ic_launcher"
    android:shortcutShortLabel="@string/markdoist_shortcut_capture"
    android:shortcutLongLabel="@string/markdoist_shortcut_capture">
    <intent
      android:action="android.intent.action.VIEW"
      android:targetPackage="${pkg}"
      android:targetClass="${pkg}.MainActivity"
      android:data="markdoist://capture" />
    <categories android:name="android.shortcut.conversation" />
  </shortcut>
</shortcuts>
`;
}

module.exports = function withCaptureShortcut(config) {
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const pkg = cfg.android?.package;
      const res = path.join(cfg.modRequest.platformProjectRoot, "app/src/main/res");
      fs.mkdirSync(path.join(res, "xml"), { recursive: true });
      fs.writeFileSync(path.join(res, "xml/markdoist_shortcuts.xml"), shortcutsXml(pkg));
      const values = path.join(res, "values");
      fs.mkdirSync(values, { recursive: true });
      fs.writeFileSync(
        path.join(values, "markdoist_strings.xml"),
        `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <string name="markdoist_shortcut_capture">Neue Aufgabe</string>\n</resources>\n`,
      );
      return cfg;
    },
  ]);
  return withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    activity["meta-data"] = (activity["meta-data"] ?? []).filter(
      (m) => m.$["android:name"] !== "android.app.shortcuts",
    );
    activity["meta-data"].push({
      $: { "android:name": "android.app.shortcuts", "android:resource": "@xml/markdoist_shortcuts" },
    });
    return cfg;
  });
};
