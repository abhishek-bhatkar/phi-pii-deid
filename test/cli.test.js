import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const cli = new URL("../dist/cli.js", import.meta.url).pathname;
const unsafeFixture = new URL("./fixtures/synthetic-fhir-bundle.json", import.meta.url).pathname;

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8"
  });
}

test("scan exits non-zero when findings are present", () => {
  const result = run(["scan", unsafeFixture]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /field\.name/);
});

test("deidentify, verify, and report commands work together", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phi-pii-deid-"));
  const sanitized = join(dir, "sanitized.json");
  const report = join(dir, "report.md");
  const csvReport = join(dir, "report.csv");

  const deidentify = run(["deidentify", unsafeFixture, "--out", sanitized]);
  assert.equal(deidentify.status, 0, deidentify.stderr);

  const verify = run(["verify", sanitized]);
  assert.equal(verify.status, 0, verify.stderr);
  assert.match(verify.stdout, /PASS/);

  const reportResult = run(["report", sanitized, "--out", report]);
  assert.equal(reportResult.status, 0, reportResult.stderr);
  assert.match(await readFile(report, "utf8"), /Status: PASS/);
  assert.match(await readFile(csvReport, "utf8"), /^file,path,severity,rule_id,label,placeholder,reason,value_preview\n/);
  assert.match(reportResult.stdout, /Wrote CSV report/);
});

test("report supports a custom CSV output path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phi-pii-deid-"));
  const markdown = join(dir, "unsafe.md");
  const csv = join(dir, "unsafe-findings.csv");

  const reportResult = run(["report", unsafeFixture, "--out", markdown, "--csv-out", csv]);
  assert.equal(reportResult.status, 0, reportResult.stderr);
  assert.match(await readFile(markdown, "utf8"), /WARNINGS REMAIN/);
  assert.match(await readFile(csv, "utf8"), /field\.name/);
});

test("strict safe harbor mode and CMS report flag are accepted by CLI", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phi-pii-deid-"));
  const markdown = join(dir, "strict.md");
  const csv = join(dir, "strict.csv");

  const scan = run(["scan", unsafeFixture, "--mode", "strict-safe-harbor"]);
  assert.equal(scan.status, 2);
  assert.match(scan.stdout, /safeharbor\.date/);

  const report = run(["report", unsafeFixture, "--out", markdown, "--csv-out", csv, "--mode", "strict-safe-harbor", "--cms-report"]);
  assert.equal(report.status, 0, report.stderr);
  assert.match(await readFile(markdown, "utf8"), /Mode: strict-safe-harbor/);
  assert.match(await readFile(markdown, "utf8"), /CMS-style report mode is enabled/);
  assert.match(await readFile(csv, "utf8"), /safeharbor\.date/);
});

test("verify exits non-zero for unsafe input", () => {
  const result = run(["verify", unsafeFixture]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /FAIL/);
});

test("scan supports directories and quoted globs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phi-pii-deid-"));
  await mkdir(join(dir, "nested"));
  await copyFile(unsafeFixture, join(dir, "nested", "unsafe.json"));

  const directoryScan = run(["scan", dir]);
  assert.equal(directoryScan.status, 2);
  assert.match(directoryScan.stdout, /unsafe\.json/);

  const globScan = run(["scan", `${dir}/**/*.json`]);
  assert.equal(globScan.status, 2);
  assert.match(globScan.stdout, /field\.name/);
});

test("deidentify supports directory input with output directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phi-pii-deid-"));
  const inputDir = join(dir, "input");
  const outputDir = join(dir, "output");
  await mkdir(join(inputDir, "nested"), { recursive: true });
  await copyFile(unsafeFixture, join(inputDir, "nested", "unsafe.json"));

  const result = run(["deidentify", inputDir, "--out", outputDir]);
  assert.equal(result.status, 0, result.stderr);

  const output = await readFile(join(outputDir, "nested", "unsafe.json"), "utf8");
  assert.match(output, /\[REDACTED_NAME\]/);
  assert.equal(output.includes("Avery"), false);
});

test("explain lists rules and explains a specific rule", () => {
  const list = run(["explain"]);
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /field\.identifier/);

  const rule = run(["explain", "field.identifier"]);
  assert.equal(rule.status, 0, rule.stderr);
  assert.match(rule.stdout, /Rule: field\.identifier/);
  assert.match(rule.stdout, /Placeholder: \[REDACTED_IDENTIFIER\]/);
});

test("scan and verify support JSON stdout", async () => {
  const scan = run(["scan", unsafeFixture, "--json"]);
  assert.equal(scan.status, 2);
  const scanJson = JSON.parse(scan.stdout);
  assert.equal(scanJson.summary.mode, "default");
  assert.equal(scanJson.summary.files, 1);
  assert.ok(scanJson.summary.findings > 0);

  const dir = await mkdtemp(join(tmpdir(), "phi-pii-deid-"));
  const sanitized = join(dir, "sanitized.json");
  assert.equal(run(["deidentify", unsafeFixture, "--out", sanitized]).status, 0);

  const verify = run(["verify", sanitized, "--json"]);
  assert.equal(verify.status, 0);
  const verifyJson = JSON.parse(verify.stdout);
  assert.equal(verifyJson.summary.passed, true);
});

test("report supports JSON output file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phi-pii-deid-"));
  const markdown = join(dir, "report.md");
  const json = join(dir, "report.json");

  const result = run(["report", unsafeFixture, "--out", markdown, "--json-out", json]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(await readFile(json, "utf8"));
  assert.equal(report.file, unsafeFixture);
  assert.ok(report.scan.findings.length > 0);
});

test("config file can set mode and ignore rules or paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phi-pii-deid-"));
  const config = join(dir, "phi-pii-deid.json");
  await writeFile(
    config,
    JSON.stringify(
      {
        ignorePaths: ["$.entry[0].resource.name*"],
        ignoreRules: ["value.phone"],
        mode: "strict-safe-harbor"
      },
      null,
      2
    )
  );

  const scan = run(["scan", unsafeFixture, "--json", "--config", config]);
  assert.equal(scan.status, 2);
  const output = JSON.parse(scan.stdout);
  assert.equal(output.summary.mode, "strict-safe-harbor");
  assert.equal(output.results[0].findings.some((finding) => finding.ruleId === "safeharbor.date"), true);
  assert.equal(output.results[0].findings.some((finding) => finding.ruleId === "value.phone"), false);
  assert.equal(output.results[0].findings.some((finding) => finding.path.startsWith("$.entry[0].resource.name")), false);
});
