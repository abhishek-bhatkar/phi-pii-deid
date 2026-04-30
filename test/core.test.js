import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { deidentifyJson } from "../dist/redactor.js";
import { renderCsvReport, renderMarkdownReport } from "../dist/report.js";
import { scanJson } from "../dist/scanner.js";
import { verifyJson } from "../dist/verifier.js";

const fixture = async (name) => JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

test("scanner finds expected PHI/PII in synthetic FHIR bundle", async () => {
  const json = await fixture("synthetic-fhir-bundle.json");
  const result = scanJson(json);
  const ruleIds = new Set(result.findings.map((finding) => finding.ruleId));

  assert.ok(result.findings.length >= 20);
  assert.ok(ruleIds.has("field.name"));
  assert.ok(ruleIds.has("field.address"));
  assert.ok(ruleIds.has("field.telecom"));
  assert.ok(ruleIds.has("field.birthDate"));
  assert.ok(ruleIds.has("field.identifier"));
  assert.ok(ruleIds.has("value.ssn"));
  assert.ok(ruleIds.has("value.phone"));
  assert.ok(ruleIds.has("value.email"));
  assert.ok(ruleIds.has("value.timestamp"));
});

test("redactor preserves structure and removes original synthetic PHI values", async () => {
  const json = await fixture("synthetic-fhir-bundle.json");
  const result = deidentifyJson(json);
  const output = JSON.stringify(result.json);

  assert.equal(result.json.resourceType, "Bundle");
  assert.equal(Array.isArray(result.json.entry), true);
  assert.ok(output.includes("[REDACTED_NAME]"));
  assert.ok(output.includes("[REDACTED_PHONE]") || output.includes("[REDACTED_TELECOM]"));
  assert.ok(output.includes("[REDACTED_IDENTIFIER]"));

  for (const unsafe of [
    "Avery",
    "Rivera",
    "Jordan",
    "Morgan",
    "555-123-4567",
    "avery.rivera@example.invalid",
    "123-45-6789",
    "MRN-ABC12345",
    "100 Demo Street",
    "1974-08-15",
    "2026-01-20T14:30:00Z"
  ]) {
    assert.equal(output.includes(unsafe), false, `${unsafe} survived redaction`);
  }
});

test("verifier fails unsafe input and passes redacted output", async () => {
  const unsafe = await fixture("synthetic-fhir-bundle.json");
  const unsafeResult = verifyJson(unsafe);
  assert.equal(unsafeResult.passed, false);

  const redacted = deidentifyJson(unsafe).json;
  const safeResult = verifyJson(redacted);
  assert.equal(safeResult.passed, true);
});

test("report includes counts, rules, and privacy limits", async () => {
  const json = await fixture("synthetic-fhir-bundle.json");
  const report = renderMarkdownReport(json, "synthetic-fhir-bundle.json");

  assert.match(report, /# PHI\/PII De-identification Report/);
  assert.match(report, /Privacy Limits/);
  assert.match(report, /field\.name/);
  assert.match(report, /WARNINGS REMAIN/);
});

test("CSV report includes finding rows with escaped fields", async () => {
  const json = await fixture("synthetic-fhir-bundle.json");
  const report = renderCsvReport(json, "synthetic-fhir-bundle.json");

  assert.match(report, /^file,path,severity,rule_id,label,placeholder,reason,value_preview\n/);
  assert.match(report, /synthetic-fhir-bundle\.json,\$\.entry\[0\]\.resource\.name\[0\]\.family,error,field\.name,Name,\[REDACTED_NAME\]/);
  assert.match(report, /"Identifiers may include MRNs, account numbers, or national IDs\."/);
});

test("strict safe harbor mode adds broader identifier checks", () => {
  const json = {
    resourceType: "Patient",
    age: 94,
    admissionDate: "2026-01-20",
    faxNumber: "555-333-4444",
    healthPlanBeneficiaryNumber: "BENEFICIARY-778899",
    accountNumber: "ACCT-ABC123",
    licenseNumber: "LIC-778899",
    vehicleIdentifier: "1HGCM82633A004352",
    deviceSerialNumber: "SN-12345",
    ipAddress: "192.168.1.10",
    biometricHash: "fingerprint-template",
    photoData: "synthetic-image-bytes"
  };

  const defaultRules = new Set(scanJson(json).findings.map((finding) => finding.ruleId));
  assert.equal(defaultRules.has("safeharbor.ip"), false);

  const strictResult = scanJson(json, undefined, { mode: "strict-safe-harbor" });
  const strictRules = new Set(strictResult.findings.map((finding) => finding.ruleId));
  assert.ok(strictRules.has("safeharbor.date"));
  assert.ok(strictRules.has("safeharbor.age_over_89"));
  assert.ok(strictRules.has("safeharbor.fax"));
  assert.ok(strictRules.has("safeharbor.health_plan_beneficiary"));
  assert.ok(strictRules.has("safeharbor.account"));
  assert.ok(strictRules.has("safeharbor.certificate_license"));
  assert.ok(strictRules.has("safeharbor.vehicle"));
  assert.ok(strictRules.has("safeharbor.device"));
  assert.ok(strictRules.has("safeharbor.ip"));
  assert.ok(strictRules.has("safeharbor.biometric"));
  assert.ok(strictRules.has("safeharbor.image"));

  const redacted = JSON.stringify(deidentifyJson(json, { mode: "strict-safe-harbor" }).json);
  assert.match(redacted, /\[REDACTED_IP\]/);
  assert.match(redacted, /\[REDACTED_AGE_90_PLUS\]/);
  assert.equal(verifyJson(JSON.parse(redacted), { mode: "strict-safe-harbor" }).passed, true);
});

test("FHIR-aware rules preserve clinical coding metadata", () => {
  const json = {
    resourceType: "Observation",
    id: "observation-demo-002",
    status: "final",
    code: {
      coding: [
        {
          system: "http://loinc.org",
          code: "718-7",
          display: "Hemoglobin [Mass/volume] in Blood"
        }
      ]
    },
    valueQuantity: {
      value: 13.2,
      unit: "g/dL",
      system: "http://unitsofmeasure.org",
      code: "g/dL"
    },
    subject: {
      reference: "Patient/patient-demo-002"
    }
  };

  const result = deidentifyJson(json, { mode: "strict-safe-harbor" });
  const output = JSON.stringify(result.json);
  const paths = new Set(result.findings.map((finding) => finding.path));

  assert.equal(result.json.status, "final");
  assert.equal(result.json.code.coding[0].system, "http://loinc.org");
  assert.equal(result.json.code.coding[0].code, "718-7");
  assert.equal(result.json.code.coding[0].display, "Hemoglobin [Mass/volume] in Blood");
  assert.equal(result.json.valueQuantity.unit, "g/dL");
  assert.equal(result.json.valueQuantity.system, "http://unitsofmeasure.org");
  assert.equal(result.json.valueQuantity.code, "g/dL");
  assert.match(output, /\[REDACTED_IDENTIFIER\]/);
  assert.match(output, /\[REDACTED_URL\]|\[REDACTED_IDENTIFIER\]/);
  assert.equal(paths.has("$.code.coding[0].display"), false);
  assert.equal(paths.has("$.valueQuantity.system"), false);
});

test("CMS report mode suppresses small aggregate summary counts", async () => {
  const json = await fixture("synthetic-safe-bundle.json");
  json.entry[0].resource.note = [{ text: "Synthetic note for report count suppression." }];
  const report = renderMarkdownReport(json, "small-count.json", { cmsReport: true });

  assert.match(report, /CMS-style report mode is enabled/);
  assert.match(report, /Findings: <11 rule hits/);
  assert.match(report, /field\.note: <11/);
});

test("scanner reports no findings for a minimal synthetic safe fixture", async () => {
  const json = await fixture("synthetic-safe-bundle.json");
  const result = scanJson(json);
  assert.equal(result.findings.length, 0);
});
