import { expect, test } from "vitest";
import { permitsPicomatchException } from "../scripts/audit.mjs";

const cause = {
  severity: "high",
  url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
};
const finding = (name, via) => ({
  severity: "high",
  nodes: ["node_modules/" + name],
  via,
});
const packages = Object.fromEntries(
  ["picomatch", "builder", "packager"].map((name) => [
    "node_modules/" + name,
    { dev: true, version: "4.0.7" },
  ]),
);
const findings = {
  picomatch: finding("picomatch", [cause]),
  builder: finding("builder", ["packager", "picomatch"]),
  packager: finding("packager", ["builder"]),
};
const report = { auditReportVersion: 2, vulnerabilities: findings };
const now = Date.UTC(2026, 10, 17);

test("accepts development-only dependants, including connected packaging cycles, until review", () => {
  expect(permitsPicomatchException(report, packages, now)).toBe(true);
  expect(
    permitsPicomatchException(report, packages, Date.UTC(2026, 11, 17)),
  ).toBe(false);
  for (const entry of [
    { dev: false, version: "4.0.7" },
    { dev: true, version: "4.0.8" },
  ]) {
    expect(
      permitsPicomatchException(
        report,
        { ...packages, "node_modules/picomatch": entry },
        now,
      ),
    ).toBe(false);
  }
});

test("rejects unrelated advisories, unresolved causes, disconnected cycles and registry errors", () => {
  for (const builder of [
    finding("builder", [cause]),
    finding("builder", ["missing"]),
    finding("builder", ["packager"]),
    { ...findings.builder, severity: "low" },
  ]) {
    expect(
      permitsPicomatchException(
        { ...report, vulnerabilities: { ...findings, builder } },
        packages,
        now,
      ),
    ).toBe(false);
  }
  expect(
    permitsPicomatchException({ ...report, error: {} }, packages, now),
  ).toBe(false);
});
