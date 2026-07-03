# Airtable REDBOOK Status Mapping

Bookmark: AIRTABLE_REDBOOK_STATUS_MAPPING

Purpose: define how REDBOOK interpretation job statuses from Airtable map into Lingland platform workflow states. The original Airtable value must remain auditable on the booking record.

## Stored Fields

Imported REDBOOK jobs should preserve:

- `sourceStatusRaw`: original Airtable status value.
- `airtableOperationalStatus`: same raw operational status for audit/search.
- `airtableFinancialStatus`: invoice/payment status signal from Airtable invoice fields.
- `airtableStatusSignals`: source signals used by the mapper.
- `statusMappedAt`: timestamp when the mapper evaluated the record.
- `statusMappingState.assignmentState`
- `statusMappingState.timesheetState`
- `statusMappingState.billingState`
- `statusMappingState.cancellationState`

## Direct Mapping

| Airtable raw status | Lingland status | Notes |
| --- | --- | --- |
| `incoming` | `INCOMING` | New/unopened request. |
| `incoming 23` | `INCOMING` | Legacy Airtable variant. |
| `quote` | `QUOTE_PENDING` | Quote required before booking. |
| `opened` | `OPENED` | Assigned/offered but not accepted. |
| `opened tr` | `OPENED` | Translation-related legacy wording. |
| `assigned tr` | `OPENED` | Assigned/offered but not accepted. |
| `admin` | `ADMIN` | Admin/manual hold. |
| `admin tr` | `ADMIN` | Admin/manual hold for translation-like row. |
| `booked` | `BOOKED` | Professional accepted/confirmed. |
| `cancelled` | `CANCELLED` | Cancelled job. |
| `early cancellation` | `CANCELLED` | Cancellation window/early cancellation. |
| `unfilled/missed` | `CANCELLED` | No fulfilled delivery. |
| `unclaimed` | `NEEDS_ASSIGNMENT` | No accepted/assigned professional. |
| `invoicing` | `INVOICING` | Finance processing. |
| `sent and invoicing tr` | `INVOICING` | Finance processing variant. |
| `invoice sage` | `INVOICING` | Sage invoice preparation. |
| `invoiced` | `INVOICED` | Client invoice exists/sent. |
| `invoiced and completed` | `INVOICED` | Completed and invoiced. |
| `paid` | `PAID` | Client payment received. |

## Signal-Based Mapping

When direct mapping is absent, the importer derives the platform status from source signals:

| Signal | Lingland status |
| --- | --- |
| Cancel wording in raw status | `CANCELLED` |
| Paid field/status | `PAID` |
| Client invoice number / invoice amount / invoice status | `INVOICED` |
| Verified field/date | `READY_FOR_INVOICE` |
| Timesheet received / interpreter invoice evidence | `TIMESHEET_SUBMITTED` |
| Complete/done wording for past job | `SESSION_COMPLETED` |
| Pending wording | `ASSIGNMENT_PENDING` |
| Open wording with assigned interpreter | `OPENED` |
| Assign wording without accepted interpreter | `NEEDS_ASSIGNMENT` |
| Booked wording or assigned interpreter | `BOOKED` |

## Derived Workflow States

The mapper also derives:

| Derived field | Values |
| --- | --- |
| `assignmentState` | `UNASSIGNED`, `ASSIGNED_PENDING_ACCEPTANCE`, `ACCEPTED`, `CANCELLED` |
| `timesheetState` | `NOT_RECEIVED`, `SUBMITTED`, `VERIFIED`, `NOT_REQUIRED` |
| `billingState` | `NOT_READY`, `READY_FOR_INVOICE`, `INVOICED`, `PAID` |
| `cancellationState` | `ACTIVE`, `CANCELLED` |

## Conflict Rule

When Lingland has manually advanced a job beyond the incoming Airtable status and `sourceOfTruth` is not `AIRTABLE`, the sync should:

- Preserve the higher local platform status.
- Set `syncStatus: CONFLICT`.
- Write a `syncConflicts` record.
- Keep original Airtable status visible for audit.

## Non-Negotiables

- Never discard raw Airtable status.
- Never silently downgrade a manually advanced Lingland status.
- `CANCELLED` and `PAID` from Airtable are terminal/high-authority signals.
- Status mapping must be visible in Booking Detail for imported jobs.
