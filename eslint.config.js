// @ts-check
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

// Static bug analysis is covered by these type-aware typescript-eslint strict
// rules; no separate analyzer is added (see docs/verification.md).
export default tseslint.config(
  {
    ignores: [
      "dist/",
      "coverage/",
      "playwright-report/",
      "test-results/",
      "node_modules/",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
    },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    // ADR-0003: the simulation and its data catalogue are headless and
    // deterministic. They never depend on the renderer, the interface or the
    // browser, and never read the system clock or Math.random. The DOM is also
    // kept out by tsconfig.simulation.json.
    files: ["src/simulation/**/*.ts", "src/catalogue/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["three", "three/*"],
              message: "The simulation must not depend on the renderer.",
            },
            {
              group: ["**/render/**", "**/ui/**", "**/game/**"],
              message:
                "The simulation must not depend on the renderer, the interface or the game loop.",
            },
          ],
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "Use the simulation's seeded generator.",
        },
        // The same globals reached through globalThis.
        ...["Date", "performance", "crypto", "Math"].map((property) => ({
          object: "globalThis",
          property,
          message:
            "The simulation keeps its own game clock and seeded generator.",
        })),
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "Date",
          message: "The simulation keeps its own game clock.",
        },
        {
          name: "performance",
          message: "The simulation keeps its own game clock.",
        },
        {
          name: "crypto",
          message: "Use the simulation's seeded generator.",
        },
      ],
    },
  },
);
