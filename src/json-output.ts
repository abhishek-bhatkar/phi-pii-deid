import type { DeidMode, ScanResult, VerificationResult } from "./types.js";

interface JsonSummary {
  mode: DeidMode;
  files: number;
  findings: number;
}

export function renderScanJson(results: ScanResult[], mode: DeidMode): string {
  const summary: JsonSummary = {
    files: results.length,
    findings: results.reduce((total, result) => total + result.findings.length, 0),
    mode
  };
  return `${JSON.stringify({ summary, results }, null, 2)}\n`;
}

export function renderVerifyJson(results: Array<{ file: string; result: VerificationResult }>, mode: DeidMode): string {
  const findings = results.reduce((total, item) => total + item.result.findings.length, 0);
  return `${JSON.stringify(
    {
      summary: {
        files: results.length,
        findings,
        mode,
        passed: findings === 0
      },
      results
    },
    null,
    2
  )}\n`;
}
