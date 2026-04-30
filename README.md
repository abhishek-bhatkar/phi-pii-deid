# phi-pii-deid

`phi-pii-deid` is a lightweight offline CLI for making local FHIR JSON artifacts safer to share in tickets, tests, demos, and debug notes.

It is a deterministic share-safe helper. It is not a certified HIPAA de-identification system, does not make an anonymization claim, and does not replace privacy or compliance review.

## Install For Local Development

```bash
npm install
npm test
```

Run the CLI from source after building:

```bash
npm run build
node dist/cli.js --help
```

## Commands

Scan a local FHIR JSON file without changing it:

```bash
node dist/cli.js scan test/fixtures/synthetic-fhir-bundle.json
node dist/cli.js scan test/fixtures/synthetic-fhir-bundle.json --mode strict-safe-harbor
```

Create a de-identified copy:

```bash
node dist/cli.js deidentify test/fixtures/synthetic-fhir-bundle.json --out /tmp/sanitized-fhir.json
node dist/cli.js deidentify test/fixtures/synthetic-fhir-bundle.json --out /tmp/strict-sanitized-fhir.json --mode strict-safe-harbor
```

Verify that known PHI/PII rule hits are not present:

```bash
node dist/cli.js verify /tmp/sanitized-fhir.json
node dist/cli.js verify /tmp/strict-sanitized-fhir.json --mode strict-safe-harbor
```

Generate a Markdown report:
This also writes a sibling CSV file by default.

```bash
node dist/cli.js report /tmp/sanitized-fhir.json --out /tmp/sanitized-fhir-report.md
# writes /tmp/sanitized-fhir-report.md and /tmp/sanitized-fhir-report.csv
```

Use a custom CSV path when needed:

```bash
node dist/cli.js report /tmp/sanitized-fhir.json --out /tmp/sanitized-fhir-report.md --csv-out /tmp/findings.csv
```

For CMS-style public report summaries, suppress aggregate counts from 1 to 10 in the Markdown summary:

```bash
node dist/cli.js report /tmp/sanitized-fhir.json --out /tmp/sanitized-fhir-report.md --cms-report
```

## Modes

Default mode is a share-safe debugging helper. It preserves more structure while redacting common FHIR PHI/PII fields and values.

Strict Safe Harbor mode is more aggressive and aligned with HIPAA Safe Harbor identifier categories:

```bash
node dist/cli.js scan input.json --mode strict-safe-harbor
node dist/cli.js deidentify input.json --out output.json --mode strict-safe-harbor
node dist/cli.js verify output.json --mode strict-safe-harbor
```

Strict mode adds broader checks for:

- Date elements except year
- Ages over 89
- Fax numbers
- Health plan beneficiary numbers
- Account numbers
- Certificate and license numbers
- Vehicle identifiers and license plates
- Device identifiers and serial numbers
- IP addresses
- Biometric identifiers
- Photos, images, attachments, and encoded image-like fields

Strict mode still does not certify HIPAA compliance. Safe Harbor also requires no actual knowledge that remaining data can identify someone, and Expert Determination requires qualified expert review and documentation.

## What v1 Detects

The scanner uses deterministic rules only. It does not call AI services or cloud APIs.

- Names
- Addresses
- Telecom fields
- Emails
- Phone numbers
- Birth dates
- FHIR identifiers
- MRN-like values
- SSN-like values
- URLs and references
- Free-text notes and narrative text
- Exact timestamps

Strict Safe Harbor mode adds the broader categories listed above.

## Redaction Behavior

`deidentify` preserves JSON structure and replaces sensitive primitive values with placeholders such as:

- `[REDACTED_NAME]`
- `[REDACTED_PHONE]`
- `[REDACTED_IDENTIFIER]`
- `[REDACTED_ADDRESS]`
- `[REDACTED_TIMESTAMP]`
- `[REDACTED_DATE]`
- `[REDACTED_AGE_90_PLUS]`
- `[REDACTED_IP]`
- `[REDACTED_ACCOUNT]`
- `[REDACTED_LICENSE]`
- `[REDACTED_DEVICE]`
- `[REDACTED_IMAGE]`

This keeps files readable and debuggable while removing common direct identifiers from synthetic or local artifacts.

## Supported Input

v1 targets local FHIR-style JSON files, especially:

- `Bundle`
- `Patient`
- `Practitioner`
- `Encounter`
- `Observation`
- `Condition`
- related resources with similar FHIR field shapes

## Privacy Limits

Use this tool as a first-pass local helper before sharing healthcare debugging artifacts. It can miss PHI/PII in unusual fields, encoded payloads, attachments, images, nested custom extensions, or text that does not match the built-in rules.

Do not use real company data, production logs, tenant IDs, patient IDs, or internal workflow examples in public demos or tests. The fixtures in this repository are synthetic only.

`--cms-report` only suppresses small aggregate counts in report summaries. It does not perform full CMS output review and does not determine whether multiple tables can be combined to derive suppressed values.

## Demo

The reviewer path is:

```bash
npm install
npm test
npm run build
node dist/cli.js scan test/fixtures/synthetic-fhir-bundle.json
node dist/cli.js deidentify test/fixtures/synthetic-fhir-bundle.json --out /tmp/sanitized-fhir.json
node dist/cli.js verify /tmp/sanitized-fhir.json
node dist/cli.js report /tmp/sanitized-fhir.json --out /tmp/sanitized-fhir-report.md
node dist/cli.js scan test/fixtures/synthetic-fhir-bundle.json --mode strict-safe-harbor
npm run package:dry-run
```
