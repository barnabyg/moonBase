import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const advisory = "https://github.com/advisories/GHSA-fc5q-39xc-vjpf";
const reviewDate = Date.UTC(2026, 11, 17);

export function permitsPicomatchException(report, packages, now = Date.now()) {
  if (now >= reviewDate || report?.auditReportVersion !== 2 || report.error)
    return false;
  const findings = Object.entries(report.vulnerabilities ?? {});
  const dependants = new Map();
  const covered = new Set();
  for (const [name, finding] of findings) {
    if (
      finding.severity !== "high" ||
      !Array.isArray(finding.nodes) ||
      !finding.nodes.length ||
      !finding.nodes.every(
        (node) =>
          packages[node]?.dev === true &&
          (name !== "picomatch" || packages[node].version === "4.0.7"),
      ) ||
      !Array.isArray(finding.via) ||
      !finding.via.length
    )
      return false;

    for (const cause of finding.via) {
      if (typeof cause === "string") {
        if (!Object.hasOwn(report.vulnerabilities, cause)) return false;
        const users = dependants.get(cause) ?? [];
        users.push(name);
        dependants.set(cause, users);
      } else if (
        name === "picomatch" &&
        cause?.url === advisory &&
        cause.severity === "high"
      ) {
        covered.add(name);
      } else return false;
    }
  }
  // Walk outward from the advisory. Electron packaging tools depend on each
  // other, so a cycle is covered only if it connects to the reviewed cause.
  for (const name of covered) {
    for (const user of dependants.get(name) ?? []) covered.add(user);
  }
  return covered.size > 0 && covered.size === findings.length;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = spawnSync(
    process.execPath,
    [process.env.npm_execpath, "audit", "--audit-level=low", "--json"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
    if (
      result.status === 1 &&
      permitsPicomatchException(JSON.parse(result.stdout), lock.packages)
    ) {
      console.log(
        "Applied development-only picomatch exception GHSA-fc5q-39xc-vjpf (expires 2026-12-17 UTC).",
      );
    } else {
      process.stderr.write(result.stdout);
      process.exitCode = result.status ?? 1;
    }
  }
}
