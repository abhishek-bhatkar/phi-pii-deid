import { detectFindings } from "./rules.js";
import { scanJson } from "./scanner.js";
import type { DeidMode, JsonValue, RedactionResult, ScanOptions } from "./types.js";

const clone = (value: JsonValue): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;

const pathFor = (parent: string, key: string | number): string => {
  if (typeof key === "number") {
    return `${parent}[${key}]`;
  }
  return parent === "$" ? `$.${key}` : `${parent}.${key}`;
};

function redactNode(value: JsonValue, path: string, segments: string[], mode: DeidMode): JsonValue {
  const findings = detectFindings(path, segments, value, mode);
  if (findings.length > 0 && (value === null || typeof value !== "object")) {
    return findings[0]?.placeholder ?? "[REDACTED]";
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => redactNode(item, pathFor(path, index), segments, mode));
  }

  if (value !== null && typeof value === "object") {
    const output: { [key: string]: JsonValue } = {};
    for (const [key, child] of Object.entries(value)) {
      output[key] = redactNode(child, pathFor(path, key), [...segments, key], mode);
    }
    return output;
  }

  return value;
}

export function deidentifyJson(json: JsonValue, options: ScanOptions = {}): RedactionResult {
  const input = clone(json);
  const mode = options.mode ?? "default";
  const findings = scanJson(input, undefined, { mode }).findings;
  return {
    json: redactNode(input, "$", [], mode),
    findings
  };
}
