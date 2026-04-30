# phi-pii-deid

Offline TypeScript CLI for scanning and redacting likely PHI/PII from local FHIR JSON artifacts before sharing them in tickets, tests, demos, or debug notes.

This is a deterministic share-safe helper, not certified HIPAA/CMS de-identification and not an anonymization tool.

## Quick Start

Install from npm:

```bash
npm install -g phi-pii-deid
```

```bash
phi-pii-deid scan input.json
phi-pii-deid deidentify input.json --out sanitized.json
phi-pii-deid verify sanitized.json
phi-pii-deid report sanitized.json --out report.md
```

For local development:

```bash
npm install
npm test
npm run build
```

```bash
node dist/cli.js scan test/fixtures/synthetic-fhir-bundle.json
node dist/cli.js deidentify test/fixtures/synthetic-fhir-bundle.json --out /tmp/sanitized-fhir.json
node dist/cli.js verify /tmp/sanitized-fhir.json
node dist/cli.js report /tmp/sanitized-fhir.json --out /tmp/sanitized-fhir-report.md
```

`report` writes both Markdown and CSV:

```text
/tmp/sanitized-fhir-report.md
/tmp/sanitized-fhir-report.csv
```

Use `--csv-out <file.csv>` for a custom CSV path.

## Demo

Open [demo/index.html](demo/index.html) in a browser for a local paste-and-preview demo. It runs in the browser only; no upload or server is used.

## Commands

```bash
phi-pii-deid scan <file> [--mode default|strict-safe-harbor]
phi-pii-deid deidentify <file> --out <file> [--mode default|strict-safe-harbor]
phi-pii-deid verify <file> [--mode default|strict-safe-harbor]
phi-pii-deid report <file> --out <file.md> [--csv-out <file.csv>] [--mode default|strict-safe-harbor] [--cms-report]
```

From source, use `node dist/cli.js ...` instead of `phi-pii-deid ...`.

## Modes

Default mode redacts common FHIR PHI/PII while preserving useful debugging structure:

- names, addresses, telecom, email, phone
- birth dates, exact timestamps
- identifiers, MRN-like values, SSN-like values
- URLs/references
- free-text notes and narrative text

Strict mode adds broader HIPAA Safe Harbor-style checks:

```bash
node dist/cli.js deidentify input.json --out output.json --mode strict-safe-harbor
```

Additional strict checks include dates except year, ages over 89, fax, health plan beneficiary numbers, account numbers, license/certificate numbers, vehicle IDs, device IDs, IPs, biometrics, and image/attachment-like fields.

`--cms-report` suppresses small aggregate report counts from `1-10` as `<11` in Markdown summaries. It does not perform full CMS output review.

See [RULES.md](RULES.md) for rule IDs, placeholders, and known false positives.

## Limits

The tool uses local deterministic rules only. It can miss PHI/PII in unusual fields, encoded payloads, attachments, images, custom extensions, or free text that does not match a rule.

Do not use real company data, production logs, tenant IDs, patient IDs, or internal workflow examples in public demos/tests. Fixtures in this repo are synthetic only.
