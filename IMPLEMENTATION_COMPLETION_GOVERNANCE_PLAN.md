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

- [x] Sync all jobs whose Airtable/platform status is not terminal/paid. Backend now supports `OPEN_WORKFLOW` strategy with Airtable server-side formula and safe fallback.
- [x] Sync all jobs modified since the last successful sync. Backend now supports `UPDATED_SINCE_LAST_SYNC` using Airtable `LAST_MODIFIED_TIME()`.
- [ ] Sync future jobs, today's jobs and overdue jobs that are not terminal.
- [x] Sync invoices/payables linked to any open, recently modified or financially incomplete job. Finance tables now use workflow source refs from mirrored active/financially open jobs as pull-through criteria in operational strategies.
- [x] Treat `PAID` jobs as stable history after first successful sync, except when Airtable `Last Modified` is newer than platform `lastSyncedAt`. Terminal skipped rows now carry `TERMINAL_STABLE_ALREADY_MIRRORED` when fetched and unchanged.
- [x] Keep a manual `Full Audit Sync` for weekly/monthly reconciliation and go-live proof.
- [x] Replace/clarify the current `100/500/1000/5000 records` control with modes such as `Open workflow`, `Updated since last sync`, `Recent + open`, `Full audit` and `Custom limit`.

Implementation note 2026-07-04:

- Added `syncStrategy` support to manual callable syncs, maintenance sync and scheduled sync.
- Added UI strategy selector in Airtable Sync Center. Record count is now only exposed for `Custom limit`.
- `Open workflow`, `Updated since last sync`, `Recent + open`, `Full audit` and `Custom limit` are now first-class controls.
- Build verified for app and functions. Browser runtime verification is still pending because the in-app browser automation timed out while loading the route.

Implementation note 2026-07-04, pass 2:

- Added finance pull-through filtering for client invoices, interpreter invoices, translation client invoices and translator invoices.
- Operational sync strategies now consider active/financially open mirrored job `sourceRecordId` values before pulling finance rows.
- Sync result exposes `financePullThrough` so the UI can show whether the filter was active and how many finance rows were excluded from the daily cycle.
- Added explicit terminal skipped reason for unchanged `PAID`/`CANCELLED` rows that are inspected.
- Build verified for app and functions. Still needs one real Dry Run against Airtable to confirm server-side formulas and finance field-name variants against live table schema.

Implementation note 2026-07-07:

- Added a read-only `getAirtableMirrorAudit` callable for REDBOOK mirror proof.
- Reconciliation UI now has a `Mirror proof` action comparing Airtable records returned by the active sync strategy against platform bookings by `sourceRecordId`.
- The audit exposes Airtable/platform/matched/missing/outside-set counts, status-count breakdowns and a sample of missing Airtable records.
- This directly addresses the observed issue where Airtable showed 9 `Opened` jobs while the platform showed only 3 after a partial sync.
- Deployed `getAirtableMirrorAudit` and hosting. Live proof on 2026-07-07 showed 2,122 Airtable REDBOOK records in `OPEN_WORKFLOW`, 2,214 platform REDBOOK records, 2,059 matched and 63 missing from the platform for the selected strategy.
- Added admin callable `getAirtableSyncAuditTrail` so Migration/Reconciliation no longer reads `syncRuns` and `syncConflicts` directly from the browser, avoiding Firestore permission failures.
- Added persistent sync execution feedback in the Migration UI so a Dry Run/Write Sync shows an in-page running state and a durable error if the callable fails.
- Optimized REDBOOK `OPEN_WORKFLOW`/`RECENT_OPEN` processing to pre-load existing platform records and process only missing records, source-tracking backfill candidates and real status divergences instead of remapping every active Airtable row.
- Firebase logs after deployment showed the previously timing-out REDBOOK Dry Run completing with status 200 in approximately 264 seconds. Further optimization is still required before marking the daily cycle as fully ergonomic.
- Build verified for app and functions.

Implementation note 2026-07-07, pass 2:

- Added a targeted `repairMissingRedbookRecords` admin callable for the exact case exposed by Mirror Proof: Airtable returns a REDBOOK source record for the selected workflow strategy, but the platform has no booking with that `sourceRecordId`.
- The repair flow is capped to 100 missing REDBOOK records per run, requires a clean Dry repair before Write repair in the UI, and targets explicit Airtable `RECORD_ID()` values rather than relying on arbitrary first-page order.
- The record-id Airtable fetch now uses strict formula mode, so it will fail safely instead of falling back to an unfiltered fetch if Airtable rejects the formula.
- Migration/Reconciliation UI now normalizes Firestore Timestamp-shaped values before rendering sync runs and conflicts, preventing Error Boundary crashes from serialized `{_seconds, _nanoseconds}` objects.

Live verification 2026-07-08:

- Browser verification completed against the local Migration/Reconciliation UI.
- `OPEN_WORKFLOW` Mirror Proof returned 2,128 Airtable REDBOOK records, 2,214 platform REDBOOK records, 2,059 matched, 69 missing and 155 platform records outside the selected set.
- The increase from 63 to 69 missing records while matched records remained stable proves that the Airtable source continues to change and that a repeatable repair cycle is required.
- Targeted Dry repair completed without an error and enabled Write repair. The write was intentionally not executed without explicit confirmation because it will create/update real platform records.

Acceptance:

- [ ] Admin can run one safe daily Mirror Cycle without knowing Airtable table internals.
- [ ] New/updated open jobs, clients, invoices and payables are included even if they are not in Airtable's first returned page.
- [ ] Closed/paid historical jobs do not make daily sync unnecessarily heavy.
- [ ] Every skipped terminal record has an auditable reason.
- [ ] Admin can run a read-only mirror proof and see whether Airtable REDBOOK and platform bookings are balanced for the selected strategy.
- [x] Admin can prepare missing REDBOOK mirror gaps in controlled batches after a clean Dry repair.
- [x] Admin has executed a confirmed Write repair and re-run Mirror Proof to prove the missing count decreases (69 to 2 during the controlled repair run).
- [x] Missing REDBOOK repair is bounded to resumable batches and reports the remaining queue.
- [x] Mirror proof status counts are canonicalized for comparison while preserving each job's raw Airtable status.
- [x] Mirror proof compares canonical Airtable status against platform source status per matched `sourceRecordId` and exposes drift samples.

## 4. Current Baseline After Latest Deploy

Last deployed milestone:

- Commit `5c262dd`: Admin/interpreter workflow UX refinements.
- Commit `2d0bec8`: Firebase hosting cache after deploy.
- Hosting: `https://lingland-2e52f.web.app`

### Baseline Audit

| Area | Current state | Label |
| --- | --- | --- |
| Platform mode / email suppression | Shared fail-closed delivery policy now governs email and push. Browser verified current `SUPPRESSED` mode and audit events retain every attempted delivery. | IMPLEMENTED / PROVEN |
| Manual admin operation | Staff can assign, record responses, complete work, submit/approve timesheets, issue invoices and record settlements for passive profiles. | IMPLEMENTED / PROVEN |
| Airtable REDBOOK job sync | Interpretation jobs can be imported/mirrored, with source identity in parts of the model. | PARTIAL |
| Client import | Still not fully proven from `Clients` and `Clients Book` with dedupe/conflicts. | NOT_STARTED/PARTIAL |
| Translation import | Translation service category exists, but import from `Translations` / `Web translations` is not complete. | PARTIAL |
| Client invoices | Interpretation invoice import/flow exists partially. Translation invoice import is not complete. | PARTIAL |
| Interpreter/translator invoices | Interpreter payable flow exists partially. Translator invoices/payment mapping not complete. | PARTIAL |
| Jobs Board | Airtable-like views, service scope, filters, column menu, resize/reorder/freeze, pagination and manual actions are implemented and browser-proven. | IMPLEMENTED / PROVEN |
| Booking Detail/Edit | Shared record shell, nested return context, interpretation/translation panels and assignment-safe editing are browser-proven. | IMPLEMENTED / PROVEN |
| Operations CRM / Finance CRM | Shared jobs workspace, role-specific defaults, saved views, finance lanes and responsive grid are implemented and browser-proven. | IMPLEMENTED / PROVEN |
| Data Center / Audit Control | Immutable semantic ledger covers operations, finance, communication and synchronization with actor/source context and before/after inspection. | IMPLEMENTED / PROVEN |
| Interpreter app | Web/native lifecycle, imported history, offers, timesheets, translations, invoices, activation continuity and support chat are implemented. A final live interpreter credential check remains. | IMPLEMENTED / FINAL_ACCEPTANCE_PENDING |

### Phase Progress Ledger

| Phase | Status | Evidence |
| --- | --- | --- |
| Phase A - Source Tracking Foundation | PARTIAL | Shared `SourceTrackingFields` type and `SourceTracking` helper created. Booking/client/interpreter creation paths now produce consistent source identity fields. Booking Detail exposes source table/base/hash fields when available. Cloud Functions now write `sourceBaseId`, `legacyRef`, `snapshotHash`, `airtableSnapshotHash`, `lastSyncedAt` and `lastSyncRunId` for Clients, REDBOOK jobs, Translation jobs, client invoices, interpreter invoices, translation client invoices and translator invoices. Sync actions now backfill missing source identity on existing records instead of skipping them only because the Airtable hash is unchanged. Browser verified on `/admin/bookings/airtable_recBoWGWlUh0RiPP7`: current old record shows source record/table/legacy ref, while `sourceBase` and `snapshotHash` remain `N/A` until the next real sync backfills them. Final controlled sync evidence is still required before `DONE`. |
| Phase B - Sync Runs and Conflicts | PARTIAL | Cloud Functions persist `syncRuns` for Dry Run and real Sync results. Conflicts use deterministic identities and now reopen if a problem recurs. A successful write sync automatically resolves only stale conflicts belonging to source records processed in that same run, preserving the original evidence and recording resolution run/timestamp. Manual exception handling and live reconciliation proof are still required before `DONE`. |
| Phase C - Client Import Completion | PARTIAL | Client identity extraction now captures normalized company name, Sage ref, booking contact, invoice contact/email/phone, department and location. Client matching now checks source record, Airtable key, Sage ref, booking email, invoice email and only uses normalized company name when it has a single match. Job-side client resolution now receives stronger finance/name keys. Client list search includes invoice email, Sage ref and Airtable key. Client Detail Account tab now exposes Airtable identity, Finance identity and Dedupe key. Browser verified `/admin/clients` and `/admin/clients/airtable_client_hhft-urology-department`. Remaining: explicit duplicate/conflict UI for ambiguous clients and a controlled client dry-run/sync evidence pass. |
| Phase D - Interpreter/Translator Identity Resolution | PARTIAL | Cloud Functions resolve professionals by Airtable source record id and linked record ids, then user/profile email, unique normalized UK phone and unique normalized name. Name normalization is now shared by interpreter import and REDBOOK/Translation matching, fixing case/accent drift; interpreter import backfills `normalizedName` and `normalizedPhone`. Resolver evidence includes method, confidence and ambiguous candidates. Remaining: controlled live dry/write proof, language-pair exception review and explicit manual conflict handling. |
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

Implementation note 2026-07-08:

- Added translation-only Jobs Board columns for delivery deadline, word/document volume, requested format and delivery state.
- Translation system views now expose the operational translation fields while keeping generic/finance noise hidden.
- Interpretation-focused views enforce a service boundary so old saved layouts cannot leak translation-only columns back into the interpretation workspace.
- Browser verification confirmed the Translation view exposes `Translation Deadline`, `Words / Documents` and `Delivery State`; the Interpreting view exposes none of the translation-only columns.

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
- [x] Add translation-specific optional columns/views to Jobs Board.
- [x] Ensure interpretation views do not get polluted by translation-only columns.

Acceptance:

- [x] Translation appears in Jobs Board.
- [x] Translation has correct service badge and fields.
- [ ] Translation can flow into billing.

Evidence:

- [ ] Dry Run with translation sample.
- [ ] Real limited sync.
- [x] Browser check: Jobs Board + Booking Detail.
- [x] Build passes.

## 12. Phase G - Client Invoice Import

Status: PARTIAL. Client invoices and translation client invoices are imported into the shared `clientInvoices` / `clientInvoiceLines` model, linked back to mirrored jobs when Airtable link fields resolve. The sync now creates explicit `syncConflicts` when an invoice has no source job link or when the Airtable job link cannot be resolved to a mirrored booking, so Finance can review unreconciled invoices instead of treating them as clean.

Implementation note 2026-07-12:

- Corrected the status mapper so `Unpaid`, `Awaiting payment` and `Outstanding` can never be classified as `PAID` by substring matching.
- Added auditable amount-field selection, `amountSourceField`, persisted `lineCount`, financial/reference integrity states and explicit conflicts for missing totals or references.
- Imported invoice lines are now replaced idempotently when Airtable links change; stale placeholder lines are deleted and penny allocation always reconciles to the document total.
- Dry Run no longer writes `syncConflicts`, making it fully read-only.
- Client invoice registry is paginated and no longer presents zero values or raw Airtable record ids as valid financial data.
- Invoice Detail blocks PDF/status progression when amount, reference, lines or linked work are incomplete. The same rule is enforced by the callable backend.

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
- [x] Detect job that should have invoice but does not.
- [x] Update Finance CRM views.

Acceptance:

- [x] Finance can see interpretation and translation invoices in one flow.
- [x] Invoice details show linked jobs or an explicit unresolved-link blocker.
- [x] Jobs show billing readiness correctly.

Evidence:

- [ ] Dry Run invoice preview.
- [ ] Limited real sync.
- [x] Browser check: Finance Board and invoice detail.
- [x] Build passes.

## 13. Phase H - Interpreter/Translator Invoice Import

Status: PARTIAL. Interpreter and translator payables are imported into the shared `interpreterInvoices` / `interpreterInvoiceLines` model, including translation units via word count/docs. The sync now creates explicit `syncConflicts` when a payable has no source job link, when the job link cannot resolve to a mirrored booking, or when the interpreter/translator cannot be resolved to an existing/passive profile.

Implementation note 2026-07-12:

- Interpreter and translator invoice statuses now use exact paid/unpaid semantics.
- Added amount-source tracking, persisted line counts, stale-line replacement and total-to-line reconciliation.
- Approval/payment is blocked in both UI and backend when payable amount, reference or linked work is incomplete.
- Existing self-bill `DRAFT` documents now have a valid approval/rejection path instead of becoming stuck.
- Payable registry is paginated; browser verification confirmed 25 rows per page and integrity blocking on an imported payable without a linked job.

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
- [x] Admin can reconcile payable totals through the financial proof audit.
- [x] Finance has one queue for payables, service-aware.

Evidence:

- [ ] Dry Run payables preview.
- [ ] Limited real sync.
- [ ] Browser check: Finance payables + Interpreter Detail.
- [x] Build passes.

## 14. Phase I - Reconciliation Reports

Status: PARTIAL. Airtable Migration now has a Reconciliation workspace backed by real `syncConflicts`, with severity/module filters, reason summary, recommended action per issue and CSV export. Current coverage is conflict-driven from sync runs; deeper reports such as platform records missing source and duplicate detection still need dedicated reconciliation queries.

Implementation note 2026-07-12:

- Added read-only `getFinancialReconciliationAudit` across client invoices, interpreter invoices and both line collections.
- The audit detects missing amounts, missing lines, unresolved job links, line/document total divergence, indexed line-count divergence, missing references and source/platform status divergence.
- Results include affected/healthy document counts, reason/severity summaries, actionable rows, links to invoice details and CSV export.
- This audit also covers legacy imported records before another Airtable sync creates new conflict documents.

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
- [x] Status divergence for imported invoice/payable documents.
- [x] Amount and line-total divergence.
- [ ] Communication suppression audit.

Tasks:

- [x] Build reconciliation service.
- [x] Add Data Center/Airtable Migration report route.
- [x] Add filters by module/severity.
- [x] Add recommended action per issue.
- [x] Add export option.
- [x] Add financial document proof independent from the latest sync run.

Acceptance:

- [ ] Admin can answer: "What does not match Airtable?"
- [x] Every imported sync conflict has severity and next action.

Evidence:

- [ ] Browser check with report rows.
- [ ] Service output sample.
- [x] Build passes.

## 15. Phase J - Operations CRM Hardening

Status: PARTIAL. Operations now exposes the daily queues as first-class system views and sidebar shortcuts: Incoming, Needs Assignment, Waiting Response, Booked Today/Tomorrow, Overdue, Timesheets, Interpreting, Translations and Translations Delivery Due. Browser verification confirmed the Incoming view loads and single row click opens the preview drawer with Close/Edit/Full details; double click/full-details behavior already exists in JobsBoard. Remaining work is deeper QA of saved-view lifecycle, right-click actions across all states, and mobile/tablet density.

Implementation note 2026-07-12:

- Tablet navigation now becomes an overlay below 1280 px, increasing the 1024 px Jobs Board work area from 688 px to the full 1024 px.
- Mobile navigation has a real close action and closes after route/query navigation.
- Browser verification at 390 px confirmed one horizontal grid scroller, in-bounds toolbar/search, full-width job preview and non-overlapping footer actions.
- Frozen index/job columns stayed at stable x positions at intermediate and maximum horizontal scroll; light/dark frozen backgrounds are fully opaque.
- Icon-only mobile tools now expose accessible labels/tooltips; the Filter panel stays inside the viewport and toggles closed from the same control.
- Favorites no longer repeat in the main view list. View duplication was added, while system views remain protected from deletion.
- View filter-rule controls now wrap into two rows on mobile instead of being clipped outside the drawer.

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
- [x] Verify saved views:
  - [x] create
  - [x] rename
  - [x] duplicate
  - [x] favorite
  - [x] reorder
  - [x] delete when allowed
  - [x] protected system views
- [x] Verify column behavior:
  - [x] resize
  - [x] reorder
  - [x] hide/show
  - [x] freeze/unfreeze
  - [x] sort
  - [x] group
  - [x] filter
- [x] Remove finance-heavy default noise from Operations views.

Acceptance:

- [ ] Charlie can operate bookings without opening Airtable for ordinary tasks.
- [x] Dense table uses screen space properly across desktop, tablet and mobile.
- [x] No duplicate filter bars, repeated favorite views or redundant admin chat control.

Evidence:

- [x] Browser check desktop.
- [x] Browser check mobile/tablet width.
- [x] Build passes.

## 16. Phase K - Finance CRM Hardening

Goal: Finance workspace is the daily command center for accounts/invoices/payables.

Tasks:

- [x] Confirm finance route/workspace defaults.
- [x] Ensure finance views:
  - [x] Billing queue
  - [x] Ready client invoice
  - [x] Client invoices
  - [x] Awaiting payment
  - [x] Interpreter payables
  - [x] Translator payables
  - [x] Profit review
  - [x] Exceptions
- [x] Use same underlying job data, not duplicate tables.
- [x] Show finance columns by default:
  - [x] client invoice status
  - [x] amount
  - [x] VAT
  - [x] interpreter payable
  - [x] margin
  - [x] payment status
  - [x] source invoice ref
- [x] Remove Operations-only noise from Finance views.
- [x] Add reconciliation hooks for invoice/payable exceptions.

Acceptance:

- [x] Finance staff can operate accounts without opening Airtable for ordinary, integrity-complete tasks.
- [x] Finance sees interpretation and translation together, filterable by service.

Evidence:

- [x] Browser check finance queues.
- [x] Browser check invoice details.
- [x] Build passes.

Evidence recorded 2026-07-12:

- [x] Finance view and lane are reflected in the URL and survive reload/return navigation.
- [x] Client Billing, Interpreter Payables, Translator Payables and Finance Exceptions were exercised in the browser.
- [x] Mobile Finance CRM uses one horizontal grid scroller with no body overflow; first data row moved from y=446 to y=377 after toolbar/summary compaction.
- [x] Tablet Finance CRM first data row moved from y=302 to y=222; search and view share the first toolbar row.
- [x] Dark mode toolbar, summary and grid header are fully opaque with readable foreground colors.
- [x] Client invoice registry exposes 247 documents with 25-row pagination; missing amount/reference/link blocks PDF and lifecycle progression.
- [x] Interpreter invoice registry exposes 300 legacy/current documents after removing the Firestore `orderBy(issueDate)` exclusion of records without that field.
- [x] Payable detail with a valid amount but no linked job/timesheet blocks approval and displays the exact integrity reason.
- [x] Imported multi-job invoices allocate totals per linked line/job; client and professional totals are no longer duplicated across every linked job.
- [x] `npm run typecheck`, 4 test files / 16 tests, Functions TypeScript build and production web build pass.

## 17. Phase L - Booking Detail/Edit Unification

Goal: view and edit are the same mental model, with contextual panels for interpretation or translation.

Status: IMPLEMENTED and browser-proven on real interpretation and translation mirror records.

Tasks:

- [x] Create shared Booking shell.
- [x] Use same header/status/actions in view and edit.
- [x] Add explicit Edit button in detail.
- [x] Preserve return-to origin for back navigation.
- [x] Interpretation panels:
  - [x] session/location
  - [x] assignment
  - [x] contact
  - [x] timesheet
  - [x] billing
  - [x] events/messages
- [x] Translation panels:
  - [x] source docs
  - [x] languages
  - [x] word count/docs
  - [x] quote
  - [x] deadline/delivery
  - [x] translator
  - [x] billing
  - [x] events/messages
- [x] Remove duplicate fields on the same screen.
- [x] Ensure mobile layout works.

Acceptance:

- [x] User never feels view/edit are two different products.
- [x] Back returns to the previous workspace/view.
- [x] Translation detail does not show irrelevant interpretation fields.

Evidence:

- [x] Browser check from Jobs Board.
- [x] Browser check from Operations Dashboard.
- [x] Browser check edit/save/cancel.
- [x] Build passes.

Evidence recorded 2026-07-12:

- [x] `BookingRecordShell` now owns the shared header, status/reference identity, section framing, metric band and nested navigation state.
- [x] Browser path `Filtered Job Centre -> modal -> Full details -> Edit -> Cancel -> detail -> Back` returned to the same view, service scope and search result.
- [x] Page 3 (`51-75 of 2281 jobs`) and a horizontal grid offset of 334px were restored after opening and closing a full booking record.
- [x] Operations Command returned to its previous internal scroll position (`scrollTop=620`) after a detail visit.
- [x] Real translation mirror job `T8817 Czech` exposed deadline, source documents, format, quote, delivery email and translator; irrelevant session/location fields were absent.
- [x] Real interpretation mirror job `LING26.17028 Turkish` retained session/location, schedule and interpreter panels with no translation panel.
- [x] Translation edit exposed deadline, word count, document count, final quote, delivery email, format and source-document upload/removal.
- [x] Terminal jobs show assignment as locked; changing a professional on an open job now uses the transactional assignment callable instead of writing only booking fields.
- [x] Responsive shared shell collapses actions, metrics, form grids and the sidebar without fixed-width page content; measured desktop/tablet body width has no overflow.
- [x] 5 test files / 21 tests, web typecheck, Functions TypeScript build and production web build pass.

## 18. Phase M - Interpreter App End-to-End

Goal: active and passive interpreter/tradutor histories remain coherent.

Status: IMPLEMENTED. A final authenticated browser acceptance as an interpreter remains pending because no safe interpreter test credential was available during this phase.

Tasks:

- [x] Validate interpreter dashboard with imported historical jobs.
- [x] Validate offers/assigned jobs.
- [x] Validate accepted job flow.
- [x] Validate timesheet submission.
- [x] Validate translation delivery/timesheet variant.
- [x] Validate invoice/payment history.
- [x] Validate passive profile activation later sees history.
- [x] Validate suppressed communication mode does not email external users.

Acceptance:

- [ ] Interpreter can use app when active.
- [x] Admin can operate on their behalf when passive.
- [x] The same history is visible after account activation.

Evidence:

- [ ] Browser check as interpreter.
- [x] Admin cross-check of same records.
- [x] Build passes.

Evidence recorded 2026-07-12:

- [x] Shared lifecycle tests cover interpretation end time, translation deadlines, offers, upcoming work, pending timesheets and imported paid history without duplication.
- [x] Imported Airtable timesheets are tagged `AIRTABLE_MIRROR`; their trigger cannot regress `INVOICED`/`PAID` jobs or emit external communication.
- [x] Imported profile activation preserves the same profile id and historical links, promotes the workforce profile safely and keeps suspended/blocked accounts locked.
- [x] Active and passive staff assignment now accepts `ACTIVE`, `IMPORTED` and translation-appropriate `ONLY_TRANSL` profiles while preventing translation-only professionals from receiving interpreting jobs.
- [x] Interpreter invoice submission is ownership-scoped, validates approved timesheets and verifies the submitted total server-side.
- [x] Web and native histories merge mirrored booking, timesheet and invoice data without inventing payment amounts.
- [x] Translation jobs expose deadline, files and units while suppressing interpretation-only check-in/location controls.
- [x] Email and push delivery share a fail-closed communication policy; current `SUPPRESSED` mode blocks all outbound delivery and preserves audit records.
- [x] Browser cross-check on a real passive imported profile showed 13 linked jobs, imported translations, claims and three open payable documents with staff controls available.
- [x] Web production build/typecheck, Functions build/tests, web lifecycle tests, native TypeScript check and Android Expo production export pass.

## 19. Phase N - Audit/Event Writer

Goal: operational changes become durable audit events.

Status: COMPLETE. Critical collections are observed server-side and the ledger exposes semantic actions with actor, source, communication and synchronization context.

Tasks:

- [x] Define `auditEvents` collection/model.
- [x] Add writer helper.
- [x] Capture:
  - [x] actor
  - [x] actor role
  - [x] entity type/id
  - [x] action
  - [x] old value
  - [x] new value
  - [x] source
  - [x] communication mode
  - [x] sync run id if relevant
  - [x] timestamp
- [x] Wire events for:
  - [x] status change
  - [x] assignment
  - [x] offer response
  - [x] timesheet
  - [x] invoice issued
  - [x] payment received/sent
  - [x] email suppressed/sent
  - [x] sync run
  - [x] conflict resolution
- [x] Update Audit Control page to show real events.

Acceptance:

- [x] Audit Control is no longer a readiness-only page.
- [x] Critical operations have trace.
- [x] Go-live automation cannot bypass audit writer.

Evidence:

- [x] Browser check real audit rows.
- [x] Manual operation creates audit event.
- [x] Build passes.

Evidence recorded 2026-07-12:

- [x] Server-side triggers observe bookings, assignments, job events, timesheets, client/interpreter invoices, users, clients, interpreters, mail, email delivery, notifications, sync runs and sync conflicts.
- [x] Semantic policy tests cover assignment acceptance, status changes, client payment receipt, interpreter payment sent, email suppression and conflict resolution.
- [x] Every event stores schema version, immutable id, actor/role, source, communication mode, sync lineage, changed fields, before/after values and timestamp.
- [x] An admin-only health check proves the writer without changing any commercial record.
- [x] Browser evidence showed `AUDIT_HEALTH_CHECK` with `SUPER_ADMIN`, `ADMIN_DIAGNOSTIC`, `SUPPRESSED` and the expected before/after detail.
- [x] 10 test files / 43 tests, Functions TypeScript build, web typecheck and production web build pass.

## 20. Phase O - Go-Live Readiness

Goal: Lingland can decide when to move from Airtable mirror to platform source of truth.

Status: IN PROGRESS. The admin Go-Live Control is implemented against real mirror, finance, conflict, sync, audit and platform-mode data. Activation remains deliberately blocked while reconciliation issues exist.

Tasks:

- [ ] Complete reconciliation report.
- [x] Confirm no external emails in mirror/test mode.
- [ ] Confirm import can stay active without duplicate data.
- [ ] Confirm clients/interpreters can be activated gradually.
- [ ] Confirm new platform forms replace Airtable forms.
- [x] Create safe-mirror rollback rule:
  - [x] restore Airtable as source of truth
  - [x] keep Airtable references and history
  - [x] restore communication suppression
  - [x] resume Airtable imports
  - [x] export audit evidence
- [x] Create persistent go-live checklist.
- [x] Add semantic audit events for platform-mode changes, readiness evidence, checklist updates and rollback.
- [x] Add automatic resolution of stale sync conflicts after a successful source-record reprocessing pass.
- [x] Add shared case/accent-safe professional identity normalization and unique UK phone fallback.

Acceptance:

- [ ] Admin can prove data parity.
- [ ] Staff can run daily operation from platform.
- [ ] Airtable can be retired as intake without losing history.

Evidence:

- [ ] Final reconciliation exported.
- [ ] Browser walkthrough of Operations + Finance + App.
- [x] Local browser proof of Go-Live Control with real persisted mode, inventory, sync, conflict and audit evidence.
- [x] 12 test files / 50 tests, Functions TypeScript build, web typecheck and production web build pass.

Current blockers recorded 2026-07-13:

- [x] Deploy the updated professional resolver and conflict lifecycle.
- [x] Run interpreter dry sync to measure identity backfill without writing: 203 unique active interpreters, with 55 profiles consolidated from multiple Airtable rows.
- [x] Run controlled Airtable workflow Dry Run and record the unresolved-professional baseline.
- [ ] Compare unresolved-professional conflicts after the controlled write cycle.
- [ ] Re-run mirror parity audit; previous evidence had 16 missing jobs and 153 status divergences.
- [ ] Reconcile 466 affected invoices by reason before any finance sign-off.
- [ ] Upgrade the Cloud Functions runtime before Node.js 20 decommissioning on 2026-10-30.

Dry-run performance evidence recorded 2026-07-13:

- [x] The first `OPEN_WORKFLOW` Interpretation Jobs Dry Run completed successfully in the backend in 218 seconds.
- [x] Firebase logs proved status 200 even though the browser reported `deadline-exceeded`; this was a client callable timeout, not a failed synchronization.
- [x] REDBOOK professional resolution now loads one interpreter directory per sync invocation instead of issuing repeated Firestore profile queries for every job.
- [x] Long-running Airtable sync, audit, repair and interpreter import callables now allow up to 600 seconds on the web client.
- [x] The repeated browser Dry Run returned normally in approximately 230 seconds: 27 creates, 2,074 updates, 45 skips, 35 conflicts and 0 errors.
- [x] The Write Sync guard stayed disabled while running and became available only after the successful result returned.
- [x] REDBOOK write processing now uses eight controlled workers so the one-time 2,101-record backfill is not executed as thousands of serial Firestore round trips.
- [x] Dry Run detail retention prioritizes errors and conflict rows; Migration UI includes a dedicated Conflicts filter and per-row reason.
- [ ] Deploy the controlled-concurrency/detail tranche and repeat the Dry Run before the write cycle.

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

Next work should remain inside Phase O:

1. Deploy and prove identity/conflict reconciliation in Dry Run.
2. Execute a controlled write mirror cycle with communications suppressed.
3. Re-run mirror and financial audits and classify every remaining systemic reason.
4. Complete Operations, Finance, client and interpreter pilot evidence.

Reason: the platform now has the control plane; the remaining work is data proof and exception closure before activation.

Do not spend another cycle on broad visual cleanup until these foundations are implemented.
