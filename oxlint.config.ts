import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "unicorn", "oxc"],
  env: {
    builtin: true,
    node: true,
  },
  categories: {
    correctness: "error",
    suspicious: "warn",
  },
  rules: {
    "eslint/no-unused-vars": [
      "error",
      { args: "all", argsIgnorePattern: "^_" },
    ],
    "typescript/no-explicit-any": "error",
    "eslint/no-console": "off",
    "eslint/no-underscore-dangle": [
      "warn",
      { allow: ["__filename", "__dirname"] },
    ],
  },
  overrides: [
    {
      files: ["test/**/*.test.ts"],
      plugins: ["vitest"],
      rules: {
        "vitest/no-disabled-tests": "error",
        "vitest/no-focused-tests": "error",
      },
    },
  ],
  ignorePatterns: ["dist/**", "node_modules/**", "test/fixtures/**"],
});
