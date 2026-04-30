import type { DeidMode, Finding, JsonValue } from "./types.js";

interface FieldRule {
  id: string;
  label: string;
  placeholder: string;
  severity: Finding["severity"];
  reason: string;
  modes?: DeidMode[];
  matches: (segments: string[], value: JsonValue) => boolean;
}

interface ValueRule {
  id: string;
  label: string;
  placeholder: string;
  severity: Finding["severity"];
  reason: string;
  modes?: DeidMode[];
  skipSafeFhirMetadata?: boolean;
  pattern: RegExp;
}

const exact = (segments: string[], name: string): boolean =>
  segments[segments.length - 1]?.toLowerCase() === name.toLowerCase();

const has = (segments: string[], name: string): boolean =>
  segments.some((segment) => segment.toLowerCase() === name.toLowerCase());

const hasAny = (segments: string[], names: string[]): boolean =>
  names.some((name) => has(segments, name));

const hasKeyContainingAny = (segments: string[], names: string[]): boolean =>
  segments.some((segment) => names.some((name) => segment.toLowerCase().includes(name.toLowerCase())));

const parent = (segments: string[]): string | undefined => segments[segments.length - 2]?.toLowerCase();

const inCoding = (segments: string[]): boolean => has(segments, "coding") || has(segments, "code");

const inSafeCodingMetadata = (segments: string[]): boolean =>
  inCoding(segments) && ["system", "code", "display", "version", "unit"].includes(segments[segments.length - 1]?.toLowerCase() ?? "");

const inSafeFhirMetadata = (segments: string[]): boolean =>
  ["resourceType", "status", "gender", "language"].includes(segments[segments.length - 1] ?? "") ||
  inSafeCodingMetadata(segments) ||
  parent(segments) === "meta" ||
  parent(segments) === "category" ||
  parent(segments) === "interpretation" ||
  parent(segments) === "unit" ||
  has(segments, "valueQuantity") ||
  has(segments, "valueCodeableConcept");

const isPrimitive = (value: JsonValue): boolean =>
  value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";

const isNonEmptyString = (value: JsonValue): value is string => typeof value === "string" && value.trim().length > 0;

const isExactTimestamp = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value);

const isAgeOver89 = (value: JsonValue): boolean => {
  if (typeof value === "number") {
    return value > 89;
  }
  return typeof value === "string" && /^(?:9\d|1\d{2,})$/.test(value.trim());
};

const preview = (value: JsonValue): string | undefined => {
  if (value === null || typeof value === "object") {
    return undefined;
  }
  const raw = String(value);
  return raw.length > 80 ? `${raw.slice(0, 77)}...` : raw;
};

export const FIELD_RULES: FieldRule[] = [
  {
    id: "field.name",
    label: "Name",
    placeholder: "[REDACTED_NAME]",
    severity: "error",
    reason: "FHIR name fields can identify patients or clinicians.",
    matches: (segments, value) => has(segments, "name") && isPrimitive(value)
  },
  {
    id: "field.address",
    label: "Address",
    placeholder: "[REDACTED_ADDRESS]",
    severity: "error",
    reason: "Address fields are direct location identifiers.",
    matches: (segments, value) => has(segments, "address") && isPrimitive(value)
  },
  {
    id: "field.telecom",
    label: "Telecom",
    placeholder: "[REDACTED_TELECOM]",
    severity: "error",
    reason: "FHIR telecom values commonly include phone numbers and emails.",
    matches: (segments, value) => has(segments, "telecom") && exact(segments, "value") && isPrimitive(value)
  },
  {
    id: "field.birthDate",
    label: "Birth Date",
    placeholder: "[REDACTED_BIRTH_DATE]",
    severity: "error",
    reason: "Birth dates are PHI under common de-identification policies.",
    matches: (segments, value) => exact(segments, "birthDate") && isPrimitive(value)
  },
  {
    id: "field.identifier",
    label: "Identifier",
    placeholder: "[REDACTED_IDENTIFIER]",
    severity: "error",
    reason: "Identifiers may include MRNs, account numbers, or national IDs.",
    matches: (segments, value) =>
      !inSafeFhirMetadata(segments) &&
      (exact(segments, "id") || hasAny(segments, ["identifier", "mrn", "ssn"])) &&
      isPrimitive(value)
  },
  {
    id: "field.url",
    label: "URL",
    placeholder: "[REDACTED_URL]",
    severity: "warning",
    reason: "URLs may contain tenant, patient, or environment identifiers.",
    matches: (segments, value) => !inSafeFhirMetadata(segments) && hasAny(segments, ["url", "reference"]) && isPrimitive(value)
  },
  {
    id: "field.note",
    label: "Free Text Note",
    placeholder: "[REDACTED_NOTE]",
    severity: "warning",
    reason: "Free text can contain unstructured PHI/PII.",
    matches: (segments, value) =>
      !inSafeFhirMetadata(segments) &&
      (hasAny(segments, ["note", "comment"]) || exact(segments, "div") || exact(segments, "display")) &&
      isPrimitive(value)
  },
  {
    id: "field.timestamp",
    label: "Exact Timestamp",
    placeholder: "[REDACTED_TIMESTAMP]",
    severity: "warning",
    reason: "Exact timestamps can identify encounters or events.",
    matches: (segments, value) =>
      hasAny(segments, ["period", "effectiveDateTime", "issued", "authoredOn", "recordedDate", "date", "start", "end"]) &&
      isNonEmptyString(value) &&
      isExactTimestamp(value)
  },
  {
    id: "safeharbor.date",
    label: "Date Element",
    placeholder: "[REDACTED_DATE]",
    severity: "error",
    reason: "Strict Safe Harbor mode removes date elements directly related to an individual except year.",
    modes: ["strict-safe-harbor"],
    matches: (segments, value) =>
      !inSafeFhirMetadata(segments) && !exact(segments, "year") && isNonEmptyString(value) && /^\d{4}-\d{2}-\d{2}$/.test(value)
  },
  {
    id: "safeharbor.age_over_89",
    label: "Age Over 89",
    placeholder: "[REDACTED_AGE_90_PLUS]",
    severity: "error",
    reason: "Strict Safe Harbor mode aggregates ages over 89 into an age 90 or older category.",
    modes: ["strict-safe-harbor"],
    matches: (segments, value) => hasAny(segments, ["age", "birthDate"]) && isAgeOver89(value)
  },
  {
    id: "safeharbor.fax",
    label: "Fax Number",
    placeholder: "[REDACTED_FAX]",
    severity: "error",
    reason: "Fax numbers are HIPAA Safe Harbor identifiers.",
    modes: ["strict-safe-harbor"],
    matches: (segments, value) => hasKeyContainingAny(segments, ["fax"]) && isPrimitive(value)
  },
  {
    id: "safeharbor.health_plan_beneficiary",
    label: "Health Plan Beneficiary Number",
    placeholder: "[REDACTED_HEALTH_PLAN_BENEFICIARY]",
    severity: "error",
    reason: "Health plan beneficiary numbers are HIPAA Safe Harbor identifiers.",
    modes: ["strict-safe-harbor"],
    matches: (segments, value) => hasKeyContainingAny(segments, ["beneficiary", "subscriber", "member"]) && isPrimitive(value)
  },
  {
    id: "safeharbor.account",
    label: "Account Number",
    placeholder: "[REDACTED_ACCOUNT]",
    severity: "error",
    reason: "Account numbers are HIPAA Safe Harbor identifiers.",
    modes: ["strict-safe-harbor"],
    matches: (segments, value) => hasKeyContainingAny(segments, ["account"]) && isPrimitive(value)
  },
  {
    id: "safeharbor.certificate_license",
    label: "Certificate or License Number",
    placeholder: "[REDACTED_LICENSE]",
    severity: "error",
    reason: "Certificate and license numbers are HIPAA Safe Harbor identifiers.",
    modes: ["strict-safe-harbor"],
    matches: (segments, value) => hasKeyContainingAny(segments, ["certificate", "license", "licence", "npi"]) && isPrimitive(value)
  },
  {
    id: "safeharbor.vehicle",
    label: "Vehicle Identifier",
    placeholder: "[REDACTED_VEHICLE]",
    severity: "error",
    reason: "Vehicle identifiers and license plates are HIPAA Safe Harbor identifiers.",
    modes: ["strict-safe-harbor"],
    matches: (segments, value) => hasKeyContainingAny(segments, ["vehicle", "plate", "vin"]) && isPrimitive(value)
  },
  {
    id: "safeharbor.device",
    label: "Device Identifier",
    placeholder: "[REDACTED_DEVICE]",
    severity: "error",
    reason: "Device identifiers and serial numbers are HIPAA Safe Harbor identifiers.",
    modes: ["strict-safe-harbor"],
    matches: (segments, value) => hasKeyContainingAny(segments, ["device", "serial", "udi"]) && isPrimitive(value)
  },
  {
    id: "safeharbor.biometric",
    label: "Biometric Identifier",
    placeholder: "[REDACTED_BIOMETRIC]",
    severity: "error",
    reason: "Biometric identifiers such as finger and voice prints are HIPAA Safe Harbor identifiers.",
    modes: ["strict-safe-harbor"],
    matches: (segments, value) => hasKeyContainingAny(segments, ["biometric", "fingerprint", "voiceprint"]) && isPrimitive(value)
  },
  {
    id: "safeharbor.image",
    label: "Photo or Image",
    placeholder: "[REDACTED_IMAGE]",
    severity: "error",
    reason: "Full-face photos and comparable images are HIPAA Safe Harbor identifiers.",
    modes: ["strict-safe-harbor"],
    matches: (segments, value) => hasKeyContainingAny(segments, ["photo", "image", "attachment", "content", "data"]) && isPrimitive(value)
  }
];

export const VALUE_RULES: ValueRule[] = [
  {
    id: "value.email",
    label: "Email",
    placeholder: "[REDACTED_EMAIL]",
    severity: "error",
    reason: "Value matches an email address pattern.",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
  },
  {
    id: "value.phone",
    label: "Phone",
    placeholder: "[REDACTED_PHONE]",
    severity: "error",
    reason: "Value matches a phone number pattern.",
    pattern: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/
  },
  {
    id: "value.ssn",
    label: "SSN",
    placeholder: "[REDACTED_IDENTIFIER]",
    severity: "error",
    reason: "Value matches a US SSN-like pattern.",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/
  },
  {
    id: "value.mrn",
    label: "MRN-like Identifier",
    placeholder: "[REDACTED_IDENTIFIER]",
    severity: "error",
    reason: "Value matches an MRN-like identifier pattern.",
    pattern: /\b(?:MRN|MEDREC|PATIENT)[-:\s]*[A-Z0-9]{4,}\b/i
  },
  {
    id: "value.url",
    label: "URL",
    placeholder: "[REDACTED_URL]",
    severity: "warning",
    reason: "Value matches a URL pattern.",
    skipSafeFhirMetadata: true,
    pattern: /\bhttps?:\/\/[^\s"]+/i
  },
  {
    id: "value.timestamp",
    label: "Exact Timestamp",
    placeholder: "[REDACTED_TIMESTAMP]",
    severity: "warning",
    reason: "Value matches an exact timestamp pattern.",
    pattern: /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\b/
  },
  {
    id: "safeharbor.ip",
    label: "IP Address",
    placeholder: "[REDACTED_IP]",
    severity: "error",
    reason: "IP addresses are HIPAA Safe Harbor identifiers.",
    modes: ["strict-safe-harbor"],
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/
  },
  {
    id: "safeharbor.account_value",
    label: "Account-like Identifier",
    placeholder: "[REDACTED_ACCOUNT]",
    severity: "error",
    reason: "Value matches an account-like identifier pattern.",
    modes: ["strict-safe-harbor"],
    pattern: /\b(?:ACCT|ACCOUNT|SUBSCRIBER|BENEFICIARY)[-:\s]*[A-Z0-9]{4,}\b/i
  },
  {
    id: "safeharbor.license_value",
    label: "License-like Identifier",
    placeholder: "[REDACTED_LICENSE]",
    severity: "error",
    reason: "Value matches a license-like identifier pattern.",
    modes: ["strict-safe-harbor"],
    pattern: /\b(?:LIC|LICENSE|CERT)[-:\s]*[A-Z0-9]{4,}\b/i
  },
  {
    id: "safeharbor.vin",
    label: "Vehicle Identifier",
    placeholder: "[REDACTED_VEHICLE]",
    severity: "error",
    reason: "Value matches a VIN-like pattern.",
    modes: ["strict-safe-harbor"],
    pattern: /\b[A-HJ-NPR-Z0-9]{17}\b/i
  }
];

const appliesInMode = (modes: DeidMode[] | undefined, mode: DeidMode): boolean =>
  !modes || modes.includes(mode);

export function detectFindings(
  path: string,
  segments: string[],
  value: JsonValue,
  mode: DeidMode = "default"
): Finding[] {
  const fieldFindings = FIELD_RULES.filter((rule) => appliesInMode(rule.modes, mode) && rule.matches(segments, value)).map((rule) => ({
    path,
    ruleId: rule.id,
    label: rule.label,
    placeholder: rule.placeholder,
    severity: rule.severity,
    reason: rule.reason,
    valuePreview: preview(value)
  }));

  if (typeof value !== "string") {
    return fieldFindings;
  }

  const valueFindings = VALUE_RULES.filter(
    (rule) =>
      appliesInMode(rule.modes, mode) &&
      !(rule.skipSafeFhirMetadata && inSafeFhirMetadata(segments)) &&
      rule.pattern.test(value)
  ).map((rule) => ({
    path,
    ruleId: rule.id,
    label: rule.label,
    placeholder: rule.placeholder,
    severity: rule.severity,
    reason: rule.reason,
    valuePreview: preview(value)
  }));

  return [...fieldFindings, ...valueFindings];
}
