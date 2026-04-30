import { listRuleDocs } from "./rules.js";

export function renderExplain(ruleId?: string): string {
  const rules = listRuleDocs();

  if (!ruleId) {
    return rules
      .map((rule) => `${rule.ruleId}\t${rule.mode}\t${rule.kind}\t${rule.placeholder}\t${rule.label}`)
      .join("\n");
  }

  const rule = rules.find((candidate) => candidate.ruleId === ruleId);
  if (!rule) {
    const known = rules.map((candidate) => candidate.ruleId).join(", ");
    throw new Error(`Unknown rule: ${ruleId}\nKnown rules: ${known}`);
  }

  return [
    `Rule: ${rule.ruleId}`,
    `Label: ${rule.label}`,
    `Mode: ${rule.mode}`,
    `Kind: ${rule.kind}`,
    `Severity: ${rule.severity}`,
    `Placeholder: ${rule.placeholder}`,
    `Reason: ${rule.reason}`
  ].join("\n");
}
