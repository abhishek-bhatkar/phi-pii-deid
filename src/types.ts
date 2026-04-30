export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Severity = "info" | "warning" | "error";
export type DeidMode = "default" | "strict-safe-harbor";

export interface ScanOptions {
  mode?: DeidMode;
}

export interface ReportOptions extends ScanOptions {
  cmsReport?: boolean;
}

export interface Finding {
  path: string;
  ruleId: string;
  label: string;
  placeholder: string;
  severity: Severity;
  reason: string;
  valuePreview?: string;
}

export interface RuleSummary {
  ruleId: string;
  label: string;
  count: number;
}

export interface ScanResult {
  file?: string;
  findings: Finding[];
  ruleSummaries: RuleSummary[];
}

export interface RedactionResult {
  json: JsonValue;
  findings: Finding[];
}

export interface VerificationResult {
  passed: boolean;
  findings: Finding[];
}

export interface RuleDoc {
  ruleId: string;
  label: string;
  placeholder: string;
  severity: Severity;
  mode: DeidMode;
  kind: "field" | "value";
  reason: string;
}
