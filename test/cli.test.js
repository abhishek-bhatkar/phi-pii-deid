import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
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
