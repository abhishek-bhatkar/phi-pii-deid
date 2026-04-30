#!/usr/bin/env node
import { extname, join, dirname, basename } from "node:path";
import { deidentifyJson } from "./redactor.js";
import { renderExplain } from "./explain.js";
import { outputPathFor, resolveInputFiles } from "./inputs.js";
import { renderCsvReport, renderMarkdownReport, renderScanText } from "./report.js";
import { scanJson } from "./scanner.js";
import { verifyJson } from "./verifier.js";
import { readJsonFile, writeJsonFile, writeTextFile } from "./io.js";
import type { DeidMode } from "./types.js";

interface Args {
  command?: string;
  inputs: string[];
  out?: string;
  csvOut?: string;
  mode: DeidMode;
  cmsReport: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { cmsReport: false, help: false, inputs: [], mode: "default" };
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--out") {
      const out = argv[index + 1];
      if (!out) {
        throw new Error("--out requires a file path");
      }
      args.out = out;
      index += 1;
    } else if (arg === "--csv-out") {
      const csvOut = argv[index + 1];
      if (!csvOut) {
        throw new Error("--csv-out requires a file path");
      }
      args.csvOut = csvOut;
      index += 1;
    } else if (arg === "--mode") {
      const mode = argv[index + 1];
      if (mode !== "default" && mode !== "strict-safe-harbor") {
        throw new Error("--mode must be default or strict-safe-harbor");
      }
      args.mode = mode;
      index += 1;
    } else if (arg === "--cms-report") {
      args.cmsReport = true;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  args.command = positional[0];
  args.inputs = positional.slice(1);
  return args;
}

function usage(): string {
  return [
    "Usage:",
    "  phi-pii-deid scan <file|dir|glob...> [--mode default|strict-safe-harbor]",
    "  phi-pii-deid deidentify <file|dir|glob...> --out <file|dir> [--mode default|strict-safe-harbor]",
    "  phi-pii-deid verify <file|dir|glob...> [--mode default|strict-safe-harbor]",
    "  phi-pii-deid report <file> --out <file.md> [--csv-out <file.csv>] [--mode default|strict-safe-harbor] [--cms-report]",
    "  phi-pii-deid explain [rule-id]",
    "",
    "Offline deterministic helper for making local FHIR JSON artifacts safer to share."
  ].join("\n");
}

function defaultCsvPath(markdownPath: string): string {
  const extension = extname(markdownPath);
  if (extension) {
    return join(dirname(markdownPath), `${basename(markdownPath, extension)}.csv`);
  }
  return `${markdownPath}.csv`;
}

function hasStructuredInput(inputs: Array<{ path: string; relativePath: string }>): boolean {
  return inputs.length > 1 || inputs.some((input) => input.relativePath !== basename(input.path));
}

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);

  if (args.help || !args.command) {
    console.log(usage());
    return args.help ? 0 : 1;
  }

  if (args.command === "explain") {
    console.log(renderExplain(args.inputs[0]));
    return 0;
  }

  if (args.inputs.length === 0) {
    throw new Error(`${args.command} requires at least one input`);
  }

  if (args.command === "scan") {
    const inputs = await resolveInputFiles(args.inputs);
    const showHeaders = hasStructuredInput(inputs);
    let findingCount = 0;
    for (const input of inputs) {
      const json = await readJsonFile(input.path);
      const result = scanJson(json, input.path, { mode: args.mode });
      findingCount += result.findings.length;
      console.log(showHeaders ? `${input.path}\n${renderScanText(result)}` : renderScanText(result));
    }
    return findingCount > 0 ? 2 : 0;
  }

  if (args.command === "deidentify") {
    if (!args.out) {
      throw new Error("deidentify requires --out <file>");
    }
    const inputs = await resolveInputFiles(args.inputs);
    const structuredInput = hasStructuredInput(inputs);
    if (structuredInput && extname(args.out)) {
      throw new Error("deidentify requires --out <directory> when processing multiple inputs");
    }
    let findingCount = 0;
    for (const input of inputs) {
      const json = await readJsonFile(input.path);
      const result = deidentifyJson(json, { mode: args.mode });
      const outputPath = outputPathFor(input, args.out, structuredInput);
      findingCount += result.findings.length;
      await writeJsonFile(outputPath, result.json);
      console.log(`Wrote de-identified JSON to ${outputPath}`);
    }
    console.log(`Mode: ${args.mode}`);
    console.log(`Redacted ${findingCount} rule hits across ${inputs.length} file${inputs.length === 1 ? "" : "s"}.`);
    return 0;
  }

  if (args.command === "verify") {
    const inputs = await resolveInputFiles(args.inputs);
    let findingCount = 0;
    for (const input of inputs) {
      const json = await readJsonFile(input.path);
      const result = verifyJson(json, { mode: args.mode });
      findingCount += result.findings.length;
      if (result.passed) {
        console.log(`${input.path}: PASS`);
      } else {
        console.error(`${input.path}: FAIL: ${result.findings.length} known PHI/PII rule hits remain.`);
        console.error(renderScanText({ file: input.path, findings: result.findings, ruleSummaries: [] }));
      }
    }
    if (findingCount === 0) {
      return 0;
    }
    return 2;
  }

  if (args.command === "report") {
    if (!args.out) {
      throw new Error("report requires --out <file>");
    }
    if (args.inputs.length !== 1) {
      throw new Error("report currently accepts exactly one input file");
    }
    const json = await readJsonFile(args.inputs[0]);
    const csvOut = args.csvOut ?? defaultCsvPath(args.out);
    await writeTextFile(args.out, renderMarkdownReport(json, args.inputs[0], { cmsReport: args.cmsReport, mode: args.mode }));
    await writeTextFile(csvOut, renderCsvReport(json, args.inputs[0], { cmsReport: args.cmsReport, mode: args.mode }));
    console.log(`Wrote Markdown report to ${args.out}`);
    console.log(`Wrote CSV report to ${csvOut}`);
    return 0;
  }

  throw new Error(`Unknown command: ${args.command}`);
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
