// The single verification command (`npm run verify`). It runs every quality
// check in a fixed order, stops at the first failure, and changes nothing on
// disk apart from the ignored build and test output folders. Each tool is
// configured to treat warnings as errors; see README, "Verification".
//
// CI runs the end-to-end tests in a job of their own, beside the other
// checks, so it passes --skip-e2e to one job and --e2e-only to the other.
import { spawnSync } from "node:child_process";

const e2e = "test:e2e";
const allSteps = [
  ["Formatting (Prettier)", "format:check"],
  [
    "Lint and static bug analysis (typescript-eslint, type-aware strict)",
    "lint",
  ],
  ["Type check (tsc --noEmit, strict)", "typecheck"],
  ["Unit and scenario tests (Vitest)", "test"],
  ["End-to-end tests (Playwright, Firefox)", e2e],
  ["Dependency audit (npm audit)", "audit"],
  ["Secret scan (secretlint)", "secrets"],
  ["Production build (Vite)", "build"],
];

const [option, ...extra] = process.argv.slice(2);
const filters = {
  "--skip-e2e": ([, script]) => script !== e2e,
  "--e2e-only": ([, script]) => script === e2e,
};
if (extra.length > 0 || (option !== undefined && !(option in filters))) {
  console.error("Usage: node scripts/verify.mjs [--skip-e2e | --e2e-only]");
  process.exit(2);
}
const steps =
  option === undefined ? allSteps : allSteps.filter(filters[option]);

for (const [index, [title, script]] of steps.entries()) {
  console.log(`\n=== ${index + 1}/${steps.length} ${title} ===`);
  // One command string (rather than an argument list) so the shell can find
  // npm.cmd on Windows; the script names are fixed above.
  const result = spawnSync(`npm run --silent ${script}`, {
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    console.error(`\nverify failed at: ${title}`);
    process.exit(result.status ?? 1);
  }
}

console.log(
  option === undefined
    ? "\nverify passed: every check ran cleanly."
    : `\nverify passed (${option}): every selected check ran cleanly.`,
);
