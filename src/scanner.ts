import { detectFindings } from "./rules.js";
import type { DeidMode, Finding, JsonValue, RuleSummary, ScanOptions, ScanResult } from "./types.js";

const pathFor = (parent: string, key: string | number): string => {
  if (typeof key === "number") {
    return `${parent}[${key}]`;
  }
  return parent === "$" ? `$.${key}` : `${parent}.${key}`;
};

function walk(value: JsonValue, path: string, segments: string[], findings: Finding[], mode: DeidMode): void {
  findings.push(...detectFindings(path, segments, value, mode));

  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, pathFor(path, index), segments, findings, mode));
    return;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      walk(child, pathFor(path, key), [...segments, key], findings, mode);
    }
  }
}

export function summarizeRules(findings: Finding[]): RuleSummary[] {
  const counts = new Map<string, RuleSummary>();
  for (const finding of findings) {
    const existing = counts.get(finding.ruleId);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(finding.ruleId, { ruleId: finding.ruleId, label: finding.label, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => a.ruleId.localeCompare(b.ruleId));
}

const escapeRegex = (value: string): string => value.replace(/[.+^${}()|[\]\\]/g, "\\$&");

function wildcardToRegex(pattern: string): RegExp {
  return new RegExp(`^${pattern.split("*").map(escapeRegex).join(".*")}$`);
}

function filterFindings(findings: Finding[], options: ScanOptions): Finding[] {
  const ignoredRules = new Set(options.ignoreRules ?? []);
  const ignoredPathPatterns = (options.ignorePaths ?? []).map(wildcardToRegex);
  return findings.filter(
    (finding) =>
      !ignoredRules.has(finding.ruleId) &&
      !ignoredPathPatterns.some((pattern) => pattern.test(finding.path))
  );
}

export function scanJson(json: JsonValue, file?: string, options: ScanOptions = {}): ScanResult {
  const findings: Finding[] = [];
  walk(json, "$", [], findings, options.mode ?? "default");
  const filteredFindings = filterFindings(findings, options);

  return {
    file,
    findings: filteredFindings.sort((a, b) => a.path.localeCompare(b.path) || a.ruleId.localeCompare(b.ruleId)),
    ruleSummaries: summarizeRules(filteredFindings)
  };
}
