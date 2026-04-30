# Rules

`phi-pii-deid` uses deterministic path and value rules. Rules are intentionally conservative for local sharing, but they are not a HIPAA/CMS certification.

## Default Rules

| Rule | Catches | Placeholder | Notes |
| --- | --- | --- | --- |
| `field.name` | FHIR `name.*` primitives | `[REDACTED_NAME]` | May catch non-person names if stored under `name`. |
| `field.address` | FHIR `address.*` primitives | `[REDACTED_ADDRESS]` | Redacts city/state/postal/line values. |
| `field.telecom` | `telecom[].value` | `[REDACTED_TELECOM]` | Leaves telecom `system` such as `phone` or `email`. |
| `field.birthDate` | `birthDate` | `[REDACTED_BIRTH_DATE]` | Strict mode also catches other date-only values. |
| `field.identifier` | `id`, `identifier`, `mrn`, `ssn` paths | `[REDACTED_IDENTIFIER]` | Preserves common clinical coding metadata. |
| `field.url` | `url` and `reference` paths | `[REDACTED_URL]` | Preserves code-system and unit-system URLs. |
| `field.note` | `note`, `comment`, narrative `div`, risky `display` | `[REDACTED_NOTE]` | Preserves code displays and common FHIR status fields. |
| `field.timestamp` | exact timestamp values in date/time paths | `[REDACTED_TIMESTAMP]` | Exact encounter/event timestamps can be identifying. |
| `value.email` | email pattern | `[REDACTED_EMAIL]` | Applies anywhere in string values. |
| `value.phone` | US-style phone pattern | `[REDACTED_PHONE]` | Applies anywhere in string values. |
| `value.ssn` | `123-45-6789` pattern | `[REDACTED_IDENTIFIER]` | US SSN-like values only. |
| `value.mrn` | MRN/patient/medrec-like values | `[REDACTED_IDENTIFIER]` | May catch synthetic patient references. |
| `value.url` | `http://` or `https://` values | `[REDACTED_URL]` | Useful in free text and custom fields. |
| `value.timestamp` | ISO exact timestamp pattern | `[REDACTED_TIMESTAMP]` | Applies anywhere in string values. |

## Strict Safe Harbor Rules

These rules are enabled with `--mode strict-safe-harbor`.

| Rule | Catches | Placeholder | Notes |
| --- | --- | --- | --- |
| `safeharbor.date` | date-only values except year | `[REDACTED_DATE]` | Preserves common coding metadata. |
| `safeharbor.age_over_89` | age values greater than 89 | `[REDACTED_AGE_90_PLUS]` | Placeholder represents 90+ aggregation. |
| `safeharbor.fax` | fax paths | `[REDACTED_FAX]` | Path-based. |
| `safeharbor.health_plan_beneficiary` | beneficiary/subscriber/member paths | `[REDACTED_HEALTH_PLAN_BENEFICIARY]` | Path-based. |
| `safeharbor.account` | account paths | `[REDACTED_ACCOUNT]` | Path-based. |
| `safeharbor.certificate_license` | certificate/license/NPI paths | `[REDACTED_LICENSE]` | NPI can be useful provider metadata; strict mode redacts it. |
| `safeharbor.vehicle` | vehicle/plate/VIN paths | `[REDACTED_VEHICLE]` | Path-based. |
| `safeharbor.device` | device/serial/UDI paths | `[REDACTED_DEVICE]` | Path-based. |
| `safeharbor.biometric` | biometric/fingerprint/voiceprint paths | `[REDACTED_BIOMETRIC]` | Path-based. |
| `safeharbor.image` | photo/image/attachment/content/data paths | `[REDACTED_IMAGE]` | Flags image-like payloads and attachments. |
| `safeharbor.ip` | IPv4 address pattern | `[REDACTED_IP]` | Value-based. |
| `safeharbor.account_value` | account/subscriber/beneficiary-like values | `[REDACTED_ACCOUNT]` | Value-based. |
| `safeharbor.license_value` | license/certificate-like values | `[REDACTED_LICENSE]` | Value-based. |
| `safeharbor.vin` | VIN-like 17-character values | `[REDACTED_VEHICLE]` | Value-based. |

## FHIR Metadata Preserved

To keep sanitized files useful for debugging, the scanner avoids redacting common clinical metadata:

- `resourceType`, `status`, `gender`, `language`
- `code.coding[].system`, `code.coding[].code`, `code.coding[].display`
- `valueQuantity.system`, `valueQuantity.code`, `valueQuantity.unit`
- common `meta`, `category`, and `interpretation` metadata

Patient/person identifiers, references, free-text notes, and timestamps are still redacted when rules match.
