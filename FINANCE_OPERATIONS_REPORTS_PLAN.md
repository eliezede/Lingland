# Finance & Operations Reports Plan

Bookmark: FINANCE_OPERATIONS_REPORTS_PLAN

Purpose: create a reporting and intelligence layer inside Lingland that combines financial, operational and migration/mirror data into interactive dashboards, exportable PDF reports and presentation-ready summaries.

This module should not be a decorative dashboard. It should be a working reporting centre for Finance, Operations and management.

## Implementation Status

Current status: PHASE 1-8 INITIAL SLICE IMPLEMENTED.

Implemented:

- Canonical global Reports route added at `/admin/reports`.
- Legacy reports route `/admin/finance/reports` points to the new Reports module.
- Primary admin sidebar includes `Reports` as a cross-functional area.
- Global filters exist for report preset, period, date basis, service, status and client search.
- Reporting data service centralizes report filters, metrics, chart datasets and read-only insights.
- KPI strip exists for revenue, ready to invoice, unpaid, payables, margin and blockers.
- Interactive charts exist for revenue/margin trend, jobs by status, aged receivables and service mix.
- Chart/KPI click creates a drill-down filter for the records table.
- Drill-down table lists linked jobs with status, client, service, revenue, cost and margin.
- PDF export generates a filtered Lingland report with KPIs and visible drill-down rows.
- Presentation export generates a landscape PDF deck with cover, executive KPIs, status/service mix, top clients and action list.
- PDF and presentation exports are audit logged in Firestore through `reportExportLogs`.
- Report export buttons are permission-gated for admin users.
- Scheduled report drafts can be saved for selected reports with internal-only delivery metadata.
- Reports include a read-only operational insights panel based on active filters.
- Saved reports can be created, updated, applied and deleted from `/admin/reports`.
- Saved report preferences persist in Firestore through `ReportService`.

Still pending:

- Backend/server-side report execution for scheduled reports.
- PPTX/Canva/Google Slides export service.
- Scheduled report automation worker and delivery pipeline.
- Department-level export permissions and bank/payables field masking.
- External AI insights integration with approval workflow.

## 1. Product Goal

Create a `Reports` area under Finance that can answer the daily and monthly questions Lingland staff need:

- What needs billing action now?
- What revenue is ready, invoiced, paid or overdue?
- Which jobs are operationally stuck?
- Which clients, interpreters and services are profitable?
- Where are timesheets, invoices and payments blocked?
- Are Airtable mirror data and platform workflow data reconciled?
- What should be exported for management, accounts or audit?

The reports layer should combine:

- interpretation jobs;
- translation jobs;
- client invoices;
- interpreter/payable invoices;
- timesheets;
- payments;
- client records;
- interpreter records;
- Airtable sync metadata;
- future Starling/bank reconciliation data;
- future AI insights.

## 2. Navigation

### Finance Sidebar

Add a `Reports` item in the primary admin sidebar:

- Command
- Job Centre
- Network
- Finance
- Reports
- Comms
- Administration

Route:

```txt
/admin/reports
```

Compatibility routes:

```txt
/admin/billing/reports
/admin/finance/reports
```

### Optional Board Shortcuts

Add a read-only shortcut from Command:

```txt
/admin/dashboard -> Reports summary card -> /admin/reports
```

The main ownership remains Finance, but reports must be cross-functional.

## 3. User Roles

### Accounts Role

Primary reports:

- invoice ready;
- client invoices issued;
- unpaid invoices;
- interpreter payables;
- margin review;
- payment aging;
- finance exceptions;
- reconciliation gaps.

### Bookings Role

Primary reports:

- incoming jobs;
- unassigned jobs;
- waiting response;
- overdue sessions;
- today/tomorrow workload;
- cancelled/not executed jobs;
- timesheet missing;
- interpreter workload.

### Management / Super Admin

Primary reports:

- revenue and margin;
- operational throughput;
- client profitability;
- interpreter profitability and reliability;
- service mix;
- platform adoption;
- mirror vs platform quality;
- weekly/monthly PDF pack.

## 4. Core UX Principles

- Reports are a working tool, not a marketing dashboard.
- Filters are global, compact and always understandable.
- Every chart must have a table/drill-down path.
- Every number must be traceable to records.
- PDF/export should use the exact active filters.
- No duplicated dashboards with contradictory numbers.
- No cards-only UI for high-volume operational data.
- Charts summarize; tables explain.
- Drill-down opens the job/client/interpreter modal first, not a full page unless requested.

## 5. Reports Hub Layout

Page structure:

```txt
Reports Header
  - title
  - selected saved report/view
  - date range
  - export buttons
  - save report button

Global Filters Bar
  - period
  - service
  - workspace
  - client
  - interpreter
  - status
  - billing state
  - source

KPI Strip
  - revenue
  - ready to invoice
  - unpaid
  - payables
  - gross margin
  - operational blockers

Main Canvas
  - chart grid
  - report-specific visualizations

Drill-down Table
  - shared Jobs Board grid engine where possible
  - service-aware columns
  - finance/operations column presets
```

## 6. Global Filters

Shared filters:

- date range:
  - today;
  - yesterday;
  - this week;
  - last week;
  - this month;
  - last month;
  - this quarter;
  - this year;
  - custom.
- date basis:
  - booked date;
  - completed date;
  - timesheet date;
  - invoice date;
  - payment date;
  - Airtable last modified.
- service:
  - all;
  - interpreting;
  - translation.
- status:
  - incoming;
  - opened;
  - booked;
  - completed;
  - timesheet submitted;
  - ready for invoice;
  - invoiced;
  - paid;
  - cancelled;
  - not executed.
- billing state:
  - not ready;
  - missing timesheet;
  - ready;
  - invoicing;
  - invoiced;
  - awaiting payment;
  - paid;
  - issue.
- client.
- interpreter/professional.
- language pair.
- location type:
  - onsite;
  - online;
  - phone;
  - translation delivery.
- source:
  - Airtable mirror;
  - platform booking;
  - manual admin entry;
  - imported historical.
- staff owner, when available.

Filter behaviour:

- filters must update KPIs, charts and table together;
- active filters must be visible as chips;
- report URLs must preserve filters;
- saved reports must store filters;
- exports must include filters in the generated file.

## 7. Report Families

## 7.1 Finance Reports

### Revenue Overview

Questions:

- How much revenue is booked, ready, invoiced and paid?
- Which period generated the most revenue?
- Which service category is stronger?

KPIs:

- total estimated revenue;
- ready to invoice;
- invoiced;
- paid;
- unpaid;
- average job value.

Charts:

- revenue over time;
- stacked revenue by billing state;
- revenue by service;
- revenue by client.

Drill-down:

- jobs grouped by billing state.

### Invoice Readiness

Questions:

- What can Accounts invoice today?
- What is blocked and why?

KPIs:

- ready for invoice count;
- ready amount;
- missing cost code;
- missing client invoice details;
- missing timesheet;
- sync conflict count.

Charts:

- invoice readiness funnel;
- blockers by reason;
- ready amount by client.

Drill-down:

- table with action buttons:
  - open billing;
  - mark invoiced;
  - record payable;
  - flag issue.

### Aged Receivables

Questions:

- Which invoices are unpaid?
- How old are they?

Buckets:

- 0-30 days;
- 31-60 days;
- 61-90 days;
- 90+ days.

Charts:

- aging buckets;
- unpaid by client;
- unpaid over time.

Drill-down:

- invoice lines and linked jobs.

### Interpreter Payables

Questions:

- What do we owe interpreters?
- What has been received as interpreter invoice?
- What has been paid?

KPIs:

- pending payables;
- received interpreter invoices;
- ready to pay;
- paid;
- missing interpreter invoice;
- payment exceptions.

Charts:

- payables by interpreter;
- payables by due period;
- payables by service.

Drill-down:

- job/payable table.

### Margin & Profit

Questions:

- Which clients and services are profitable?
- Where is margin missing or negative?

KPIs:

- gross revenue;
- professional cost;
- gross margin;
- margin percentage;
- negative margin jobs;
- zero-cost or zero-charge jobs.

Charts:

- margin over time;
- margin by client;
- margin by interpreter;
- margin by service;
- negative margin exceptions.

Drill-down:

- job table with revenue, cost, margin and invoice status.

## 7.2 Operations Reports

### Daily Operations

Questions:

- What does the Bookings team need to handle today?
- What is late?

KPIs:

- today jobs;
- tomorrow jobs;
- unassigned;
- waiting response;
- overdue;
- cancellations.

Charts:

- jobs by status;
- workload by day;
- unassigned by language;
- waiting response aging.

Drill-down:

- same job modal workflow as Jobs Board.

### Assignment Performance

Questions:

- How quickly do jobs get assigned?
- Which interpreters accept/decline?

Metrics:

- assignment time;
- response time;
- acceptance rate;
- decline rate;
- manual vs app acceptance;
- no-response count.

Charts:

- response funnel;
- acceptance by interpreter;
- assignment delay by language;
- assignment delay by location.

### Service Mix

Questions:

- How much work is interpreting vs translation?
- Are translations following their own due-date flow?

Charts:

- service split;
- translation due workload;
- translation completed vs invoiced;
- interpreting sessions by date.

## 7.3 Client Reports

### Client Performance

Questions:

- Which clients generate revenue?
- Which clients create operational pressure?
- Which clients pay late?

Metrics:

- revenue;
- margin;
- job volume;
- cancellation rate;
- no-show/not executed rate;
- unpaid balance;
- average payment delay.

Charts:

- top clients by revenue;
- top clients by unpaid amount;
- margin by client;
- volume vs margin matrix.

### Client Audit Pack

Exportable report for one client:

- job list;
- invoices;
- payments;
- outstanding;
- service split;
- notes/conflicts.

## 7.4 Interpreter Reports

### Interpreter Performance

Questions:

- Who is reliable?
- Who is profitable?
- Who is heavily used?

Metrics:

- assigned jobs;
- accepted jobs;
- completed jobs;
- declined jobs;
- cancelled jobs;
- payable amount;
- average response time;
- languages;
- service mix.

Charts:

- interpreter volume;
- interpreter acceptance;
- interpreter payables;
- interpreter margin contribution.

## 7.5 Mirror / Reconciliation Reports

Purpose: prove the Airtable mirror is trustworthy during transition.

Reports:

- mirrored jobs by last sync;
- Airtable status vs platform status conflicts;
- missing client link;
- missing interpreter link;
- invoice without job;
- job without invoice link;
- payable without interpreter;
- paid jobs skipped as stable history;
- open jobs refreshed by sync.

Charts:

- sync health over time;
- conflicts by type;
- records imported by source table.

Drill-down:

- conflict queue;
- open original Airtable source ref;
- open platform record.

## 8. Saved Reports

Create a saved report model:

```ts
type SavedReport = {
  id: string;
  name: string;
  description?: string;
  workspace: 'finance' | 'operations' | 'management' | 'reconciliation';
  ownerId: string;
  visibility: 'PRIVATE' | 'TEAM' | 'ADMIN';
  reportType: string;
  filters: ReportFilterState;
  charts: ReportChartConfig[];
  tableViewId?: string;
  createdAt: string;
  updatedAt: string;
};
```

Required saved reports:

- Accounts Monthly Finance;
- Accounts Invoice Ready;
- Accounts Aged Receivables;
- Accounts Interpreter Payables;
- Bookings Daily Operations;
- Bookings Unassigned Jobs;
- Bookings Waiting Response;
- Management Weekly Summary;
- Client Profitability;
- Mirror Sync Health.

## 9. Data Layer

Create reporting services that read from normalized platform collections, not directly from UI state.

Suggested files:

```txt
src/services/reportingService.ts
src/types/reports.ts
src/utils/reportMetrics.ts
src/utils/reportDateRanges.ts
src/components/reports/ReportFilters.tsx
src/components/reports/ReportKpiStrip.tsx
src/components/reports/ReportChartCard.tsx
src/pages/admin/billing/AdminReports.tsx
```

Backend/cloud functions later:

```txt
functions/src/reports/generateReportPdf.ts
functions/src/reports/generateReportDeck.ts
functions/src/reports/scheduledReportDigest.ts
```

Initial approach:

- compute reports client-side for current mirrored dataset if performance is acceptable;
- move heavy aggregation to Cloud Functions once data grows or scheduled exports are needed.

## 10. Chart Engine

Use a proven React chart library already compatible with the app stack.

Preferred requirements:

- responsive charts;
- tooltips;
- click-to-filter;
- dark mode support;
- export-friendly rendering;
- accessible labels.

Recommended chart types:

- line chart for time series;
- bar chart for clients/status/services;
- stacked bar for workflow state;
- donut only for simple split like service category;
- heatmap/calendar for workload density;
- scatter/bubble for volume vs margin.

## 11. Drill-Down Behaviour

Clicking a chart segment should:

1. apply a temporary drill-down filter;
2. update the table below;
3. show a filter chip like `Chart: unpaid 31-60 days`;
4. allow clearing the drill-down;
5. open job/client/interpreter modal on row click.

No chart should be a dead visual.

## 12. Export PDF

PDF export should support:

- current report;
- selected saved report;
- current filters;
- selected chart set;
- summary table;
- full detail table optional;
- logo and generated timestamp;
- generated by user;
- page numbers;
- confidentiality footer.

PDF layouts:

- Executive summary, short;
- Finance detail;
- Operations detail;
- Client audit pack;
- Reconciliation audit pack.

Initial implementation:

- browser-generated PDF from a print-safe report view.

Later implementation:

- Cloud Function PDF generation for scheduled reports.

## 13. Presentation Export

Presentation export should create a management deck:

Slides:

1. Cover: period, filters, report name.
2. Executive KPIs.
3. Revenue and margin.
4. Operational workload.
5. Finance blockers.
6. Client highlights.
7. Interpreter/payable highlights.
8. Risks and exceptions.
9. Action list.

Initial implementation:

- generate HTML/print deck or PPTX-ready JSON.
- generate a landscape PDF deck from the active report filters.

Later implementation:

- PPTX export service.
- Canva or Google Slides integration, optional future.

## 14. Permissions

Access:

- Super admin: all reports.
- Finance/admin: finance and management reports.
- Operations/admin: operations reports.
- Staff: only assigned workspace reports.

Initial implementation:

- admin and super admin users can export PDF/deck reports;
- export attempts by other roles are blocked in the UI and guarded in the export action.

Later implementation:

- department-level report access;
- field masking for bank, payable and margin data;
- server-side export enforcement for scheduled exports.

Sensitive data:

- bank data hidden unless bank permission exists;
- interpreter payables hidden from non-finance staff unless explicitly allowed;
- client revenue visible to admin/finance only;
- audit exports logged.

Every export should record:

- user;
- report type;
- filters;
- timestamp;
- file type;
- record count.

## 15. UI/UX Requirements

Desktop:

- compact command bar;
- no oversized decorative cards;
- chart grid above table;
- table visible without excessive vertical waste;
- filters in drawer/popover for advanced controls;
- saved reports sidebar or dropdown.

Mobile:

- KPI cards stack;
- charts become full-width;
- filters become drawer;
- export actions remain accessible;
- tables use compact row cards or horizontal grid only when needed.

Dark mode:

- charts must use dark-safe palette;
- grid/table text must maintain contrast;
- exported PDF can use light theme by default for readability.

## 16. Implementation Phases

## Phase 0 - Alignment

Goal: define exact first reports and data fields.

Checklist:

- [x] Confirm first five reports.
- [x] Confirm which users should see reports.
- [x] Confirm export priority: PDF first, presentation second.
- [x] Confirm whether reports should live only in Finance or also Command.
- [x] Confirm chart library.

Exit criteria:

- report list frozen for Phase 1;
- no duplicated report pages planned.

## Phase 1 - Reports Hub Skeleton

Goal: add navigation and base page.

Checklist:

- [x] Add primary admin sidebar item `Reports`.
- [x] Add route `/admin/reports`.
- [x] Keep `/admin/billing/reports` and `/admin/finance/reports` as compatibility aliases.
- [x] Create `AdminReports.tsx`.
- [x] Add report header.
- [x] Add global filter shell.
- [x] Add empty state for no data.
- [x] Add dark mode and mobile layout baseline.

Exit criteria:

- Reports page opens from Finance;
- UI is aligned with Finance CRM style;
- no broken navigation.

## Phase 2 - Reporting Data Service

Goal: compute trustworthy report metrics from platform data.

Checklist:

- [x] Create `reportingService.ts`.
- [x] Create report data types.
- [x] Create date range utilities.
- [x] Create service category filters.
- [x] Create finance aggregation functions.
- [x] Create operations aggregation functions.
- [x] Create reconciliation aggregation functions.
- [x] Add unit-level sanity checks where possible.

Implementation status:

- Reporting model now exposes sanity checks for status totals, service split, revenue balance and top-client coverage.
- Checks appear on-screen before KPIs and are included in PDF exports.
- Warnings do not block work, but make suspicious report totals visible before decisions are made.

Exit criteria:

- same filters produce same counts as Jobs Board/Finance Board;
- interpretation and translation can be separated or combined.

## Phase 3 - KPI Strip

Goal: first useful reporting screen.

Checklist:

- [x] Add Revenue KPI.
- [x] Add Ready to Invoice KPI.
- [x] Add Unpaid KPI.
- [x] Add Payables KPI.
- [x] Add Margin KPI.
- [x] Add Operational Blockers KPI.
- [x] Add click-to-filter on KPI cards.

Exit criteria:

- Accounts and Bookings can identify daily work from reports.

## Phase 4 - Interactive Charts

Goal: visual analysis with drill-down.

Checklist:

- [x] Revenue over time.
- [x] Jobs by status.
- [x] Invoice readiness funnel.
- [x] Aged receivables.
- [x] Payables by interpreter/professional.
- [x] Margin by client.
- [x] Service mix.
- [x] Sync health/conflicts.
- [x] Chart click applies drill-down filter.
- [x] Drill-down chip can be cleared.

Implementation status:

- Invoice readiness funnel shows timesheet, ready, invoicing, invoiced and paid stages with drill-down.
- Payables by interpreter/professional groups supplier exposure and drills into matching jobs.
- Margin by client shows revenue-weighted profitability and drills into client records.
- PDF export includes invoice funnel and professional payable summaries.

Exit criteria:

- each chart updates the table;
- no chart is disconnected from records.

## Phase 5 - Drill-Down Table

Goal: connect reports to real work.

Checklist:

- [x] Reuse shared jobs grid where feasible.
- [x] Add report table column presets.
- [x] Row click opens job modal/preview.
- [x] Client click opens client modal/detail.
- [x] Interpreter click opens interpreter preview/detail.
- [x] Export selected records to CSV.
- [x] Preserve filters in URL.

Exit criteria:

- users can move from report to action without losing context.

## Phase 6 - Saved Reports

Goal: allow Accounts, Bookings and management to maintain their own report views.

Checklist:

- [x] Add saved report Firestore model.
- [x] Add save current report.
- [x] Add rename/delete.
- [x] Add favorite reports.
- [x] Add team/admin visibility controls in UI.
- [x] Add default seeded reports.
- [x] Add URL state restore.

Exit criteria:

- user can save and reopen a report with filters/charts intact.

## Phase 7 - PDF Export

Goal: generate professional reports.

Checklist:

- [x] Add print-safe report layout.
- [x] Add PDF export button.
- [x] Include filters and timestamp.
- [x] Include KPIs.
- [x] Include selected chart data summaries.
- [x] Include summary table.
- [x] Add audit log entry.
- [x] Test dark mode does not affect PDF readability.

Implementation status:

- PDF export now uses an explicit light, print-safe layout independent of app theme.
- Export includes report metadata, active filters, KPIs, insights, status/service summaries, top clients and a detail job table.
- Export includes internal confidentiality footer, pagination and export audit logging.

Exit criteria:

- Finance can export a monthly report PDF.

## Phase 8 - Presentation Export

Goal: create management-ready decks.

Checklist:

- [x] Define deck schema.
- [x] Generate report slide data.
- [x] Add presentation export action.
- [x] Create executive deck template.
- [x] Include action list slide.
- [x] Add audit log entry.
- [ ] Add native PPTX export service.
- [ ] Add Canva or Google Slides export integration, optional future.

Exit criteria:

- management can receive a weekly/monthly report deck.

## Phase 9 - Scheduled Reports

Goal: automate report generation after the workflow is stable.

Checklist:

- [x] Add scheduled report settings.
- [x] Add weekly/monthly frequencies.
- [x] Add internal-only delivery metadata.
- [ ] Add internal-only email delivery.
- [x] Respect platform communication mode.
- [x] Store generated report history.
- [ ] Add failure notifications.

Implementation status:

- Schedule UI now reads platform communication mode and blocks active delivery while mode is `SUPPRESSED`.
- Schedules remain internal-only and can be stored as drafts during mirror/hybrid testing.
- PDF and presentation exports are written to an export log and shown back to admins as recent export history.
- Actual scheduled email delivery remains intentionally unimplemented until communication mode and automation worker are approved.

Exit criteria:

- scheduled report can run without sending external client/interpreter emails.

## Phase 10 - AI Insights Integration

Goal: connect reports to the future AI copilot safely.

Checklist:

- [x] Feed report metrics into read-only auditor.
- [x] Generate operational findings.
- [x] Generate cost-saving suggestions.
- [x] Generate process improvement suggestions.
- [x] Add AI recommendations panel inside Reports.
- [x] Require human approval for any action.

Implementation status:

- Insights remain read-only and can only drill into records or create an approval request.
- Approval requests are stored as `PENDING` in `reportApprovalRequests` with filters, record count and requested action.
- No AI/report action mutates jobs, invoices, clients or interpreters from the Reports page.
- Future autopilot work must consume the approval queue instead of executing recommendations directly.

Exit criteria:

- AI can explain patterns but cannot change records without approval.

## 17. Initial Report Set

Build these first:

1. Finance Overview.
2. Invoice Readiness.
3. Aged Receivables.
4. Interpreter Payables.
5. Daily Operations.
6. Margin & Profit.
7. Mirror Sync Health.

Do not start with too many reports. Build fewer, but make them real and actionable.

## 18. Acceptance Criteria

The reports module is acceptable only when:

- counts match source grids;
- filters apply consistently across KPIs, charts and table;
- clicking a chart updates drill-down records;
- exported PDF matches current filters;
- saved reports restore correctly;
- mobile layout is usable;
- dark mode is readable;
- Finance and Operations do not see duplicated/conflicting data;
- reports can combine interpreting and translation or separate them cleanly;
- every exported report is audit logged.

## 19. Risks

### Risk: Incorrect Aggregations

Mitigation:

- compare report counts against Jobs Board and Finance Board;
- add reconciliation checks;
- show filter basis/date basis clearly.

### Risk: Too Many Reports Too Soon

Mitigation:

- start with seven core reports;
- save advanced reports for later.

### Risk: PDF Looks Different From Screen

Mitigation:

- create dedicated print layout;
- do not print the interactive UI directly.

### Risk: Performance

Mitigation:

- paginate drill-down tables;
- pre-aggregate later in Cloud Functions;
- avoid rendering huge chart datasets directly.

### Risk: Permission Leakage

Mitigation:

- centralize report permissions;
- audit every export;
- hide payables/bank data unless allowed.

## 20. Implementation Priority

Recommended order:

1. Reports route + Finance menu.
2. Global filters and URL state.
3. Finance Overview KPIs.
4. Invoice Readiness report.
5. Drill-down table.
6. Aged Receivables.
7. Interpreter Payables.
8. Operations report.
9. PDF export.
10. Saved reports.
11. Presentation export.
12. Scheduled reports.
13. AI insights.

## 21. Connection To Existing Plans

Related documents:

- `OPERATIONS_FINANCE_CRM_WORKSPACES_PLAN.md`
- `IMPLEMENTATION_COMPLETION_GOVERNANCE_PLAN.md`
- `AIRTABLE_SYNC_IMPLEMENTATION_PLAN.md`
- `STARLING_BANK_INTEGRATION_PLAN.md`
- `AI_AUTOPILOT_PROGRESSIVE_LEARNING_PLAN.md`

This reports plan should be treated as the detailed implementation expansion of the current Reports Layer in the Operations/Finance CRM plan.
