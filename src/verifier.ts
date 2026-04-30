import { scanJson } from "./scanner.js";
import type { JsonValue, ScanOptions, VerificationResult } from "./types.js";

export function verifyJson(json: JsonValue, options: ScanOptions = {}): VerificationResult {
  const findings = scanJson(json, undefined, options).findings.filter((finding) => !String(finding.valuePreview ?? "").startsWith("[REDACTED_"));
  return {
    passed: findings.length === 0,
    findings
  };
}
