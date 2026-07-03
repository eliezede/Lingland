# Lingland Implementation Completion & Governance Plan

Bookmark: IMPLEMENTATION_COMPLETION_GOVERNANCE

Purpose: this document is the control plan for finishing the platform without superficial detours. It complements:

- `AIRTABLE_SYNC_IMPLEMENTATION_PLAN.md`
- `OPERATIONS_FINANCE_CRM_WORKSPACES_PLAN.md`
- `UX_RULES.md`

From this point forward, a phase is not complete because the page looks better. A phase is complete only when the underlying workflow works end to end, can be verified with real or dry-run data, and has a clear rollback/safety rule.

## 1. Non-Negotiable Execution Rules

- [ ] Every implementation turn must be tied to a phase in this plan.
- [ ] No UI-only change can be marked as phase completion.
- [ ] Any page that shows an action must either execute a real workflow or clearly mark the action as planned/disabled.
- [ ] Every data mutation workflow must have an audit/event requirement.
- [ ] Every import/sync workflow must be idempotent.
- [ ] Every external communication workflow must respect `communicationMode`.
- [ ] Every job/invoice/person imported from Airtable must preserve source identity.
- [ ] Every phase must end with build verification.
- [ ] Browser verification is required for UI/workflow pages.
- [ ] Commit/deploy happens only after a coherent milestone, not after random visual edits.

## 2. Completion Labels

Use these labels in progress reports:

- `DONE`: workflow works end to end and meets acceptance criteria.
- `PARTIAL`: real backend/data/workflow exists, but one or more acceptance criteria are missing.
- `UI_ONLY`: only layout/interaction improved; workflow is not complete.
- `BLOCKED`: cannot continue without data, credentials, platform decision, or external dependency.
- `NOT_STARTED`: no meaningful implementation yet.

## 3. Evidence Required Per Phase

Each phase must produce:

- [ ] Code changes linked to the phase.
- [ ] Data model or service behavior confirmed.
- [ ] UI path verified in browser when relevant.
- [ ] `npm run build` passed.
- [ ] A short audit note explaining what is done, partial, or still missing.
- [ ] No new fake buttons, mock claims, or misleading status labels.

## 3.1 High-Priority Mirror Sync Decision

Priority: HIGH.

The daily Airtable mirror must not rely on "first 100 records" or any arbitrary record count as the primary sync strategy. For live Mirror Mode, synchronization must be driven by workflow risk:

- [ ] Sync all jobs whose Airtable/platform status is not terminal/paid.
- [ ] Sync all jobs modified since the last successful sync.
- [ ] Sync future jobs, today's jobs and overdue jobs that are not terminal.
- [ ] Sync invoices/payables linked to any open, recently modified or financially incomplete job.
- [ ] Treat `PAID` jobs as stable history after first successful sync, except when Airtable `Last Modified` is newer than platform `lastSyncedAt`.
- [ ] Keep a manual `Full Audit Sync` for weekly/monthly reconciliation and go-live proof.
- [ ] Replace/clarify the current `100/500/1000/5000 records` control with modes such as `Open workflow`, `Updated since last sync`, `Recent + open`, `Full audit` and `Custom limit`.

Acceptance:

- [ ] Admin can run one safe daily Mirror Cycle without knowing Airtable table internals.
- [ ] New/updated open jobs, clients, invoices and payables are included even if they are not in Airtable's first returned page.
- [ ] Closed/paid historical jobs do not make daily sync unnecessarily heavy.
- [ ] Every skipped terminal record has an auditable reason.

## 4. Current Baseline After Latest Deploy

Last deployed milestone:

- Commit `5c262dd`: Admin/interpreter workflow UX refinements.
- Commit `2d0bec8`: Firebase hosting cache after deploy.
- Hosting: `https://lingland-2e52f.web.app`

### Baseline Audit

| Area | Current state | Label |
| --- | --- | --- |
| Platform mode / email suppression | `platformMode`, `communicationMode`, import mode and job numbering exist. Email/user services respect suppression/internal/live mode in key paths. | PARTIAL |
| Manual admin operation | Staff can record interpreter response, completion, timesheet, invoice and payment in several operational screens. | PARTIAL |
| Airtable REDBOOK job sync | Interpretation jobs can be imported/mirrored, with source identity in parts of the model. | PARTIAL |
| Client import | Still not fully proven from `Clients` and `Clients Book` with dedupe/conflicts. | NOT_STARTED/PARTIAL |
| Translation import | Translation service category exists, but import from `Translations` / `Web translations` is not complete. | PARTIAL |
| Client invoices | Interpretation invoice import/flow exists partially. Translation invoice import is not complete. | PARTIAL |
| Interpreter/translator invoices | Interpreter payable flow exists partially. Translator invoices/payment mapping not complete. | PARTIAL |
| Jobs Board | Strong Airtable-like UI foundation exists: views, filters, column menu, resize, freeze, pagination, manual actions. Needs final service-aware validation and view persistence audit. | PARTIAL |
| Booking Detail/Edit | Improved, but view/edit are not fully unified and translation context is not complete. | PARTIAL |
| Operations CRM / Finance CRM | Direction exists; finance and operations views are partially implemented. Need shared grid/workspace discipline and role defaults. | PARTIAL |
| Data Center / Audit Control | Now honest readiness/control pages, but not a real immutable audit ledger. | UI_ONLY/PARTIAL |
| Interpreter app | Dashboard/jobs/timesheets improved and translation-aware in places. Needs end-to-end passive/active interpreter validation. | PARTIAL |

### Phase Progress Ledger

| Phase | Status | Evidence |
| --- | --- | --- |
| Phase A - Source Tracking Foundation | PARTIAL | Shared `SourceTrackingFields` type and `SourceTracking` helper created. Booking/client/interpreter creation paths now produce consistent source identity fields. Booking Detail exposes source table/base/hash fields when available. Cloud Functions now write `sourceBaseId`, `legacyRef`, `snapshotHash`, `airtableSnapshotHash`, `lastSyncedAt` and `lastSyncRunId` for Clients, REDBOOK jobs, Translation jobs, client invoices, interpreter invoices, translation client invoices and translator invoices. Sync actions now backfill missing source identity on existing records instead of skipping them only because the Airtable hash is unchanged. Browser verified on `/admin/bookings/airtable_recBoWGWlUh0RiPP7`: current old record shows source record/table/legacy ref, while `sourceBase` and `snapshotHash` remain `N/A` until the next real sync backfills them. Final controlled sync evidence is still required before `DONE`. |
| Phase B - Sync Runs and Conflicts | PARTIAL | Cloud Functions now persist `syncRuns` for Dry Run and real Sync results. Status ownership mismatches now write idempotent `syncConflicts` records with source identity, severity, current/incoming values and recommendation. Airtable Migration Overview now reads recent `syncRuns` and open `syncConflicts` from Firestore and shows them in the control cockpit. Browser verified Overview via workspace select on `/admin/administration/migration`. Conflict resolution actions are still missing, so this phase is not `DONE`. |
| Phase C - Client Import Completion | PARTIAL | Client identity extraction now captures normalized company name, Sage ref, booking contact, invoice contact/email/phone, department and location. Client matching now checks source record, Airtable key, Sage ref, booking email, invoice email and only uses normalized company name when it has a single match. Job-side client resolution now receives stronger finance/name keys. Client list search includes invoice email, Sage ref and Airtable key. Client Detail Account tab now exposes Airtable identity, Finance identity and Dedupe key. Browser verified `/admin/clients` and `/admin/clients/airtable_client_hhft-urology-department`. Remaining: explicit duplicate/conflict UI for ambiguous clients and a controlled client dry-run/sync evidence pass. |
| Phase D - Interpreter/Translator Identity Resolution | PARTIAL | Cloud Functions now resolve assigned interpreters/translators by Airtable source record id and `airtableRecordIds` before falling back to user email, profile email, exact name and normalized name. Resolver returns `matchMethod`, `matchConfidence` and ambiguous candidates. REDBOOK and Translation syncs now create `syncConflicts` when Airtable has a professional signal but no safe platform match. Migration audit rows show match method/confidence. Active interpreter import writes `normalizedName`, and the shared `Interpreter` type includes it. Remaining: phone/language-pair confidence, explicit conflict resolution UI and browser audit from interpreter profile. |
| Phase E - Interpretation Job Status Mapping | PARTIAL | REDBOOK status mapper now derives operational, assignment, timesheet, billing and cancellation states. Imported interpretation jobs persist `sourceStatusRaw`, `airtableOperationalStatus`, `airtableFinancialStatus`, `airtableStatusSignals`, `statusMappedAt`, `statusMappingState`, `assignmentState`, `timesheetState`, `billingState` and `cancellationState`. Booking Detail Mirror/Source panel now shows Airtable status, mapped timestamp, assignment state and billing state. `AIRTABLE_REDBOOK_STATUS_MAPPING.md` documents the mapping table and conflict rules. Remaining: inventory actual current Airtable status values and browser check across five examples. |

## 5. Master Dependency Order

Do not jump ahead unless the dependency is already proven.

1. Source tracking foundation.
2. Sync run and conflict foundation.
3. Client import.
4. Interpreter/tradutor identity resolution.
5. Interpretation jobs status mapping.
6. Translation jobs import and status mapping.
7. Client invoice import.
8. Interpreter/translator invoice import.
9. Reconciliation reports.
10. Operations CRM hardening.
11. Finance CRM hardening.
12. Booking Detail/Edit unification.
13. Interpreter app end-to-end validation.
14. Audit/event writer.
15. Go-live readiness.

## 6. Phase A - Source Tracking Foundation

Goal: every imported or mirrored entity can be traced back to Airtable and safely updated without duplication.

Scope:

- `clients`
- `interpreters`
- `bookings`
- `clientInvoices`
- `interpreterInvoices`
- `timesheets`
- future `payments/documents`

Tasks:

- [x] Define shared source tracking shape:
  - [x] `sourceSystem`
  - [x] `sourceBaseId`
  - [x] `sourceTable`
  - [x] `sourceView`
  - [x] `sourceRecordId`
  - [x] `legacyRef`
  - [x] `snapshotHash`
  - [x] `lastSyncedAt`
  - [x] `lastSyncRunId`
- [x] Audit current types and services for missing source fields.
- [x] Add helper to generate stable source keys.
- [x] Add helper to compute snapshot hash from normalized Airtable fields.
- [x] Ensure job numbering preserves Airtable display ref when present.
- [x] Ensure platform-generated jobs still get platform numbering.
- [x] Add migration-safe fallback for existing records.

Acceptance:

- [x] Same Airtable record can be synced twice without duplicate entity.
- [x] Admin can see source record identity on detail pages.
- [x] Code has one shared helper, not repeated ad hoc source matching.

Evidence:

- [ ] Unit/service test or controlled script showing duplicate-safe upsert.
- [x] Browser check on one imported booking detail showing source info.
- [x] Build passes.

## 7. Phase B - Sync Runs and Conflicts

Goal: dry runs and real syncs leave a durable operational trail.

Tasks:

- [x] Create `syncRuns` structure.
- [x] Create `syncConflicts` structure.
- [ ] Store run metadata:
  - [x] module
  - [x] source table/view
  - [x] mode: `DRY_RUN` or `SYNC`
  - [x] startedAt / finishedAt
  - [x] actor
  - [x] counts found/create/update/skip/conflict/error
  - [ ] communication mode
  - [x] import mode
- [ ] Store conflict metadata:
  - [x] entity type
  - [x] source record id
  - [x] severity
  - [x] conflict reason
  - [ ] candidate platform records
  - [x] recommended action
  - [x] resolution status
- [x] Update Airtable Migration UI to read actual run/conflict records.
- [ ] Remove any remaining fake/mocked sync status claims.

Acceptance:

- [x] Dry Run writes a run record but does not create business entities.
- [x] Real Sync writes a run record and links changed entities to it.
- [ ] Conflicts appear in UI and can be reviewed.

Evidence:

- [x] Dry run screenshot/browser verification.
- [ ] Firestore/service inspection of created run record.
- [x] Build passes.

## 8. Phase C - Client Import Completion

Goal: clients become first-class records before jobs and invoices are imported.

Tables:

- `Clients`
- `Clients Book`

Tasks:

- [x] Map Airtable client fields centrally.
- [x] Normalize organization names.
- [x] Normalize booking contacts.
- [x] Normalize invoice contacts.
- [ ] Dedupe by:
- [x] source record id
- [x] unique client key
- [x] Sage account ref
- [x] invoice email
- [x] booking email
- [x] normalized organization name
- [x] Split organization vs department/location when Airtable data allows it.
- [ ] Preserve raw source snapshot for audit.
- [x] Add dry run preview:
  - [x] would create
  - [x] would update
  - [x] would skip
  - [ ] conflicts
- [ ] Add real sync action.
- [x] Link imported jobs to imported clients instead of weak fallback clients.

Acceptance:

- [ ] No obvious duplicate client is created silently.
- [x] Imported job resolves to a real client when Airtable has enough data.
- [x] Finance can see invoice details from client record.

Evidence:

- [ ] Dry Run with sample records.
- [ ] Real sync with limited batch.
- [x] Browser check: Clients list and Client Detail.
- [x] Build passes.

## 9. Phase D - Interpreter/Translator Identity Resolution

Goal: every assigned person from Airtable maps to an existing or passive platform profile.

Tasks:

- [ ] Centralize person matching:
  - [x] email exact
  - [x] email normalized
  - [ ] phone normalized
  - [x] name normalized
  - [ ] language pair support
  - [x] source record id
- [x] Add match confidence.
- [x] Add conflict state when two people match.
- [ ] Mark imported/passive profiles clearly.
- [ ] Ensure passive profiles can receive manual assignments.
- [ ] Ensure no external activation email is sent while communication is suppressed.
- [x] Surface identity match result in sync preview.

Acceptance:

- [ ] Airtable assigned interpreter appears on platform job.
- [ ] Admin can manually mark offer accepted/declined for passive interpreter.
- [ ] Interpreter history is preserved for later account activation.

Evidence:

- [ ] Sample sync with assigned interpreter.
- [ ] Browser check: Booking Detail and Interpreter Detail.
- [ ] Build passes.

## 10. Phase E - Interpretation Job Status Mapping

Goal: REDBOOK statuses align with platform statuses without losing original Airtable state.

Tasks:

- [ ] Inventory actual REDBOOK status values from current Airtable table.
- [x] Define mapping table:
  - [x] Airtable raw status
  - [x] platform operational status
  - [x] assignment state
  - [x] timesheet state
  - [x] billing state
  - [x] cancellation/no-show state
- [ ] Add fields:
  - [x] `airtableOperationalStatus`
  - [x] `airtableFinancialStatus`
  - [x] `sourceStatusRaw`
  - [x] `airtableStatusSignals`
  - [x] `statusMappedAt`
- [x] Add divergence detection when platform manual state conflicts with Airtable.
- [x] Ensure `INCOMING`, `PENDING_ASSIGNMENT`, `BOOKED`, `COMPLETED`, `READY_FOR_INVOICE`, `INVOICED`, `PAID`, `CANCELLED` are consistently used.
- [ ] Add status mapping info to Data/Audit readiness.

Acceptance:

- [ ] Jobs Board status matches expected Airtable meaning.
- [x] Original Airtable status remains visible/auditable.
- [x] Manual platform updates do not erase Airtable status history.

Evidence:

- [x] Status mapping table committed in code/docs.
- [ ] Browser check with at least five status examples.
- [x] Build passes.

## 11. Phase F - Translation Jobs Import

Status: PARTIAL. Translation records now enter the shared bookings model with `serviceCategory: TRANSLATION`, translator resolution, Airtable source tracking, translation-specific status state, deadline/completion/delivery fields, source documents and a dedicated Booking Detail section. The importer also parses combined language values such as `French to English` so future syncs do not display duplicated language strings. Remaining work is evidence-driven: dry run with real translation samples, Jobs Board translation column/view polish, and billing handoff validation.

Goal: translations enter the same platform as jobs with `serviceCategory: TRANSLATION`, not as a disconnected system.

Tables:

- `Translations`
- `Web translations`

Tasks:

- [x] Map translation fields:
  - [x] TR number
  - [x] status
  - [x] client/requester
  - [x] translator
  - [x] source/target languages
  - [x] word count
  - [x] document count
  - [x] quote
  - [x] deadline
  - [x] delivery/completion
  - [x] notes
  - [x] document links
- [x] Import as bookings/jobs with `serviceCategory: TRANSLATION`.
- [x] Add translation-specific status mapping.
- [x] Resolve client.
- [x] Resolve translator.
- [x] Add translation-specific fields to Booking Detail.
- [ ] Add translation-specific optional columns/views to Jobs Board.
- [ ] Ensure interpretation views do not get polluted by translation-only columns.

Acceptance:

- [ ] Translation appears in Jobs Board.
- [ ] Translation has correct service badge and fields.
- [ ] Translation can flow into billing.

Evidence:

- [ ] Dry Run with translation sample.
- [ ] Real limited sync.
- [x] Browser check: Jobs Board + Booking Detail.
- [x] Build passes.

## 12. Phase G - Client Invoice Import

Status: PARTIAL. Client invoices and translation client invoices are imported into the shared `clientInvoices` / `clientInvoiceLines` model, linked back to mirrored jobs when Airtable link fields resolve. The sync now creates explicit `syncConflicts` when an invoice has no source job link or when the Airtable job link cannot be resolved to a mirrored booking, so Finance can review unreconciled invoices instead of treating them as clean.

Goal: client invoices from interpretation and translation are unified and tied to jobs.

Tables:

- `Invoices`
- `TR invoices`

Tasks:

- [x] Map invoice number, client, date, status, amount, VAT, Sage ref.
- [x] Create/update `clientInvoices`.
- [x] Create/update invoice lines.
- [x] Link invoice lines to jobs.
- [x] Preserve source invoice record id.
- [x] Map payment status.
- [x] Detect invoice without job.
- [ ] Detect job that should have invoice but does not.
- [ ] Update Finance CRM views.

Acceptance:

- [ ] Finance can see interpretation and translation invoices in one flow.
- [ ] Invoice details show linked jobs.
- [ ] Jobs show billing readiness correctly.

Evidence:

- [ ] Dry Run invoice preview.
- [ ] Limited real sync.
- [ ] Browser check: Finance Board and invoice detail.
- [x] Build passes.

## 13. Phase H - Interpreter/Translator Invoice Import

Status: PARTIAL. Interpreter and translator payables are imported into the shared `interpreterInvoices` / `interpreterInvoiceLines` model, including translation units via word count/docs. The sync now creates explicit `syncConflicts` when a payable has no source job link, when the job link cannot resolve to a mirrored booking, or when the interpreter/translator cannot be resolved to an existing/passive profile.

Goal: payables for interpreters and translators are visible and auditable.

Tables:

- `INV interp`
- `INV TR`

Tasks:

- [x] Map invoice/payment fields.
- [x] Resolve person.
- [x] Resolve job by REDBOOK/TR number/source ref.
- [x] Create/update interpreter invoice.
- [x] Create/update payable lines.
- [x] Map translation units/word count where relevant.
- [x] Detect payable without job.
- [x] Detect payable without person.
- [ ] Surface in interpreter profile history.

Acceptance:

- [ ] Interpreter/tradutor sees correct historical payable data after activation.
- [ ] Admin can reconcile payable totals.
- [ ] Finance has one queue for payables, service-aware.

Evidence:

- [ ] Dry Run payables preview.
- [ ] Limited real sync.
- [ ] Browser check: Finance payables + Interpreter Detail.
- [x] Build passes.

## 14. Phase I - Reconciliation Reports

Status: PARTIAL. Airtable Migration now has a Reconciliation workspace backed by real `syncConflicts`, with severity/module filters, reason summary, recommended action per issue and CSV export. Current coverage is conflict-driven from sync runs; deeper reports such as platform records missing source and duplicate detection still need dedicated reconciliation queries.

Goal: before go-live, admin can prove platform data matches Airtable.

Reports:

- [ ] Airtable record missing in platform.
- [ ] Platform record missing source.
- [ ] Duplicate client.
- [ ] Duplicate interpreter/translator.
- [ ] Job without client.
- [ ] Job without assigned person when Airtable indicates one.
- [x] Invoice without job.
- [x] Payable without person.
- [x] Payable without job.
- [ ] Status divergence.
- [ ] Amount divergence.
- [ ] Communication suppression audit.

Tasks:

- [x] Build reconciliation service.
- [x] Add Data Center/Airtable Migration report route.
- [x] Add filters by module/severity.
- [x] Add recommended action per issue.
- [x] Add export option.

Acceptance:

- [ ] Admin can answer: "What does not match Airtable?"
- [x] Every imported sync conflict has severity and next action.

Evidence:

- [ ] Browser check with report rows.
- [ ] Service output sample.
- [x] Build passes.

## 15. Phase J - Operations CRM Hardening

Status: PARTIAL. Operations now exposes the daily queues as first-class system views and sidebar shortcuts: Incoming, Needs Assignment, Waiting Response, Booked Today/Tomorrow, Overdue, Timesheets, Interpreting, Translations and Translations Delivery Due. Browser verification confirmed the Incoming view loads and single row click opens the preview drawer with Close/Edit/Full details; double click/full-details behavior already exists in JobsBoard. Remaining work is deeper QA of saved-view lifecycle, right-click actions across all states, and mobile/tablet density.

Goal: Operations workspace is the daily command center for bookings, assignments and delivery.

Tasks:

- [x] Confirm sidebar route/icon for Operations vs Job Centre.
- [ ] Ensure default Operations views:
  - [x] Incoming
  - [x] Needs Assignment
  - [x] Waiting Response
  - [x] Booked Today/Tomorrow
  - [x] Overdue
  - [x] Timesheets
  - [x] Translations Delivery Due
- [x] Make row click open preview drawer/modal.
- [x] Make double click open full details.
- [x] Make right click open context actions.
- [ ] Verify saved views:
  - [ ] create
  - [ ] rename
  - [ ] duplicate
  - [ ] favorite
  - [ ] reorder
  - [ ] delete when allowed
  - [ ] protected system views
- [ ] Verify column behavior:
  - [ ] resize
  - [ ] reorder
  - [ ] hide/show
  - [ ] freeze/unfreeze
  - [ ] sort
  - [ ] group
  - [ ] filter
- [x] Remove finance-heavy default noise from Operations views.

Acceptance:

- [ ] Charlie can operate bookings without opening Airtable for ordinary tasks.
- [ ] Dense table uses screen space properly.
- [ ] No duplicate filter bars or redundant commands.

Evidence:

- [x] Browser check desktop.
- [ ] Browser check mobile/tablet width.
- [x] Build passes.

## 16. Phase K - Finance CRM Hardening

Goal: Finance workspace is the daily command center for accounts/invoices/payables.

Tasks:

- [ ] Confirm finance route/workspace defaults.
- [ ] Ensure finance views:
  - [ ] Billing queue
  - [ ] Ready client invoice
  - [ ] Client invoices
  - [ ] Awaiting payment
  - [ ] Interpreter payables
  - [ ] Translator payables
  - [ ] Profit review
  - [ ] Exceptions
- [ ] Use same underlying job data, not duplicate tables.
- [ ] Show finance columns by default:
  - [ ] client invoice status
  - [ ] amount
  - [ ] VAT
  - [ ] interpreter payable
  - [ ] margin
  - [ ] payment status
  - [ ] source invoice ref
- [ ] Remove Operations-only noise from Finance views.
- [ ] Add reconciliation hooks for invoice/payable exceptions.

Acceptance:

- [ ] Jerry can operate accounts without opening Airtable for ordinary tasks.
- [ ] Finance sees interpretation and translation together, filterable by service.

Evidence:

- [ ] Browser check finance queues.
- [ ] Browser check invoice details.
- [ ] Build passes.

## 17. Phase L - Booking Detail/Edit Unification

Goal: view and edit are the same mental model, with contextual panels for interpretation or translation.

Tasks:

- [ ] Create shared Booking shell.
- [ ] Use same header/status/actions in view and edit.
- [ ] Add explicit Edit button in detail.
- [ ] Preserve return-to origin for back navigation.
- [ ] Interpretation panels:
  - [ ] session/location
  - [ ] assignment
  - [ ] contact
  - [ ] timesheet
  - [ ] billing
  - [ ] events/messages
- [ ] Translation panels:
  - [ ] source docs
  - [ ] languages
  - [ ] word count/docs
  - [ ] quote
  - [ ] deadline/delivery
  - [ ] translator
  - [ ] billing
  - [ ] events/messages
- [ ] Remove duplicate fields on the same screen.
- [ ] Ensure mobile layout works.

Acceptance:

- [ ] User never feels view/edit are two different products.
- [ ] Back returns to the previous workspace/view.
- [ ] Translation detail does not show irrelevant interpretation fields.

Evidence:

- [ ] Browser check from Jobs Board.
- [ ] Browser check from Operations Dashboard.
- [ ] Browser check edit/save/cancel.
- [ ] Build passes.

## 18. Phase M - Interpreter App End-to-End

Goal: active and passive interpreter/tradutor histories remain coherent.

Tasks:

- [ ] Validate interpreter dashboard with imported historical jobs.
- [ ] Validate offers/assigned jobs.
- [ ] Validate accepted job flow.
- [ ] Validate timesheet submission.
- [ ] Validate translation delivery/timesheet variant.
- [ ] Validate invoice/payment history.
- [ ] Validate passive profile activation later sees history.
- [ ] Validate suppressed communication mode does not email external users.

Acceptance:

- [ ] Interpreter can use app when active.
- [ ] Admin can operate on their behalf when passive.
- [ ] The same history is visible after account activation.

Evidence:

- [ ] Browser check as interpreter.
- [ ] Admin cross-check of same records.
- [ ] Build passes.

## 19. Phase N - Audit/Event Writer

Goal: operational changes become durable audit events.

Tasks:

- [ ] Define `auditEvents` collection/model.
- [ ] Add writer helper.
- [ ] Capture:
  - [ ] actor
  - [ ] actor role
  - [ ] entity type/id
  - [ ] action
  - [ ] old value
  - [ ] new value
  - [ ] source
  - [ ] communication mode
  - [ ] sync run id if relevant
  - [ ] timestamp
- [ ] Wire events for:
  - [ ] status change
  - [ ] assignment
  - [ ] offer response
  - [ ] timesheet
  - [ ] invoice issued
  - [ ] payment received/sent
  - [ ] email suppressed/sent
  - [ ] sync run
  - [ ] conflict resolution
- [ ] Update Audit Control page to show real events.

Acceptance:

- [ ] Audit Control is no longer a readiness-only page.
- [ ] Critical operations have trace.
- [ ] Go-live automation cannot bypass audit writer.

Evidence:

- [ ] Browser check real audit rows.
- [ ] Manual operation creates audit event.
- [ ] Build passes.

## 20. Phase O - Go-Live Readiness

Goal: Lingland can decide when to move from Airtable mirror to platform source of truth.

Tasks:

- [ ] Complete reconciliation report.
- [ ] Confirm no external emails in mirror/test mode.
- [ ] Confirm import can stay active without duplicate data.
- [ ] Confirm clients/interpreters can be activated gradually.
- [ ] Confirm new platform forms replace Airtable forms.
- [ ] Create rollback rule:
  - [ ] pause imports
  - [ ] keep Airtable reference
  - [ ] restore communication suppression
  - [ ] export audit report
- [ ] Create go-live checklist.

Acceptance:

- [ ] Admin can prove data parity.
- [ ] Staff can run daily operation from platform.
- [ ] Airtable can be retired as intake without losing history.

Evidence:

- [ ] Final reconciliation exported.
- [ ] Browser walkthrough of Operations + Finance + App.
- [ ] Build passes.

## 21. Work Session Template

Every future implementation session should start with:

```text
Phase:
Goal:
Files likely touched:
Risk:
Verification:
Expected evidence:
```

Every future completion report should end with:

```text
Phase status:
Implemented:
Not implemented:
Evidence:
Next dependency:
```

## 22. Anti-Superficiality Checklist

Before saying "done", answer yes to all:

- [ ] Did this change alter the real workflow, data, service, or verified user path?
- [ ] If it is UI, is it connected to real data/actions?
- [ ] If it is an action, does it actually execute or clearly say planned/disabled?
- [ ] Does it respect hybrid/passive/admin manual mode?
- [ ] Does it respect communication suppression?
- [ ] Does it preserve source identity where relevant?
- [ ] Is there a path to audit/reconciliation?
- [ ] Was it tested with build?
- [ ] Was it tested in browser when UI was touched?
- [ ] Is the next dependency clear?

## 23. Immediate Next Phase Recommendation

Next work should be:

1. Phase A - Source Tracking Foundation.
2. Phase B - Sync Runs and Conflicts.
3. Phase E - Interpretation Job Status Mapping.
4. Phase I - Reconciliation Reports.

Reason: these phases convert the platform from "usable UI with partial sync" into an auditable mirror that can be trusted before go-live.

Do not spend another cycle on broad visual cleanup until these foundations are implemented.
