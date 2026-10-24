import type { ExpoConfig } from "expo/config";

// Version und versionCode setzt der Release-Workflow (Plan 10.2).
const version = process.env.MARKDOIST_VERSION ?? "1.0.0";
const versionCode = Number(process.env.MARKDOIST_VERSION_CODE ?? "1");

const config: ExpoConfig = {
  name: "Markdoist",
  slug: "markdoist",
  version,
  scheme: "markdoist",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  android: {
    package: "de.markdoist.aufgaben",
    versionCode,
    adaptiveIcon: {
      backgroundColor: "#FFFFFF",
      foregroundImage: "./assets/android-icon-foreground.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    "./plugins/withReleaseSigning.js",
    "./plugins/withCaptureShortcut.js",
    "./plugins/withWorkspaceBundleInputs.js",
  ],
};

export default config;
