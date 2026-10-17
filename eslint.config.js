import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/out/**",
      "**/release/**",
      "apps/mobile/android/**",
      "apps/mobile/.expo/**",
      "**/*.config.js",
      "**/*.config.mjs",
      "scripts/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/plugins/*.js"],
    languageOptions: { sourceType: "commonjs", globals: { require: "readonly", module: "writable" } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);
