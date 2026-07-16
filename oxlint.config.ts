import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "unicorn", "oxc"],
  categories: {
    correctness: "warn",
  },
  rules: {
    "eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "typescript/no-explicit-any": "warn",
    "eslint/no-console": "off",
  },
  ignorePatterns: ["dist/**", "node_modules/**"],
});
