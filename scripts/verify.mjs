// The single verification command (`npm run verify`). It runs every quality
// check in a fixed order, stops at the first failure, and changes nothing on
// disk apart from the ignored build and test output folders. Each tool is
// configured to treat warnings as errors; see README, "Verification".
import { spawnSync } from "node:child_process";

const steps = [
  ["Formatting (Prettier)", "format:check"],
  [
    "Lint and static bug analysis (typescript-eslint, type-aware strict)",
    "lint",
  ],
  ["Type check (tsc --noEmit, strict)", "typecheck"],
  ["Unit and scenario tests (Vitest)", "test"],
  ["End-to-end tests (Playwright, Firefox)", "test:e2e"],
  ["Dependency audit (npm audit)", "audit"],
  ["Secret scan (secretlint)", "secrets"],
  ["Production build (Vite)", "build"],
];

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

console.log("\nverify passed: every check ran cleanly.");
