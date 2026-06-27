# Operations & Finance CRM Workspaces Plan

Bookmark: OPERATIONS_FINANCE_CRM_WORKSPACES

## Strategic Decision

Lingland should not copy Airtable as separate tables inside the platform.

Instead, the platform should organize the same underlying operational records into two role-based CRM workspaces:

- **Operations CRM** for Bookings ownership.
- **Finance CRM** for Accounts, invoices, interpreter invoices and payment ownership.

This matches the real staff workflow:

- Charlie works mainly with bookings, assignments, delivery and operational job status.
- Jerry works mainly with accounts, invoices, interpreter invoices, payment, profit and billing readiness.

The same job record can appear in both workspaces, but each workspace shows different views, columns, actions and status priorities.

## Airtable Mapping

Current Airtable separation:

- REDBOOK
- Translations
- Clients
- Clients Book
- Interpreters
- Invoices
- INV interp
- TR invoices
- INV TR
- Payment List

Current Airtable view logic:

- Bookings views:
  - Incoming web forms
  - Jobs by status and date
  - Jobs by job number
  - Jobs by date and time
  - Jobs by interpreter
  - Jobs for today and tomorrow
  - Quoted jobs interpreting
  - Timesheets

- Accounts views:
  - Jerry interpreter view
  - View to feed interpreter invoices
  - View to feed invoices table
  - Input invoice totals
  - Attachment weight

Platform equivalent:

- Airtable tables become platform modules/entities.
- Airtable views become saved workspace views.
- Airtable manual processes become role-specific CRM workflows.

## Core Product Model

Use one shared operational data model:

- `jobs`
- `clients`
- `interpreters`
- `clientInvoices`
- `interpreterInvoices`
- `payments`
- `timesheets`
- `documents`
- `communications`
- `auditLogs`

Then expose that model through different workspaces.

This avoids duplicated data while still giving each person the interface they need.

## Workspace 1: Operations CRM

Primary owner: Charlie.

Navigation entry:

- Operations icon / suitcase icon.

Primary goal:

- Make sure every job moves from request to confirmed delivery.

Main entities:

- jobs;
- interpreters;
- clients;
- job offers;
- assignments;
- timesheets as operational handoff.

Core views:

- All active jobs
- Incoming requests
- Unassigned jobs
- Pending interpreter response
- Confirmed/booked jobs
- Today and tomorrow
- Overdue operational action
- Interpreting jobs
- Translation jobs
- Jobs by interpreter
- Jobs by client
- Jobs missing online link/location
- Timesheet expected
- Non-executed / exceptions

Default columns:

- Job number
- Status
- Booked for
- Client
- Contact
- Language
- Service category
- Interpreter/translator
- Location
- Duration/word count
- Operational action
- Notes/flags

Primary actions:

- open job modal;
- edit job;
- assign interpreter;
- send proposal;
- record interpreter accepted;
- record interpreter declined;
- mark delivered/completed;
- mark not executed;
- request timesheet;
- add internal note;
- create operational alert.

UI/UX behavior:

- Airtable-like grid.
- Saved views sidebar.
- Fast filters.
- Right-click actions.
- Double-click to open modal.
- No cards for dense operational work.
- Inline status/action controls.
- Bulk actions.
- Strong keyboard workflow.

## Workspace 2: Finance CRM

Primary owner: Jerry.

Navigation entry:

- Finance `£` icon.

Primary goal:

- Make sure every delivered job becomes correctly invoiced, paid and reconciled.

Important decision:

Finance should use the same jobs table underneath, but with finance-focused views and columns.

This is not a separate duplicate Jobs Board. It is a finance workspace over the same source of truth.

Main entities:

- jobs;
- client invoices;
- interpreter invoices;
- timesheets;
- payment list;
- clients;
- rate cards;
- billing documents;
- finance exceptions.

Core views:

- Billing queue
- Timesheets received
- Timesheets missing
- Ready for client invoice
- Ready for interpreter invoice
- Client invoice drafts
- Interpreter invoice drafts
- Awaiting payment
- Paid jobs
- Profit review
- Translation invoices
- Interpretation invoices
- Jobs missing PO/cost code
- Jobs missing rate/card billing data
- Invoice discrepancies
- Payment list

Default columns:

- Job number
- Status
- Billing status
- Client
- Client billing contact
- Interpreter/translator
- Service category
- Booked/delivered date
- Duration/word count
- Client charge
- Interpreter cost
- Margin/profit
- VAT
- PO/cost code
- Client invoice number
- Interpreter invoice number
- Payment status
- Finance action

Primary actions:

- verify timesheet;
- mark timesheet received manually;
- create client invoice draft;
- create interpreter invoice draft;
- mark invoice sent;
- mark invoice paid;
- flag billing issue;
- link payment;
- attach invoice/timesheet;
- export finance data;
- reconcile with Airtable/payment list.

UI/UX behavior:

- Similar grid engine as Operations.
- Different default views and columns.
- Finance-specific side panels.
- Billing status is more important than operational status.
- Strong totals row where useful:
  - revenue;
  - cost;
  - margin;
  - unpaid total;
  - ready-to-invoice total.

## Interpreting vs Translation

The platform should keep one unified workflow model, but use `serviceCategory` to separate operational behavior.

Categories:

- Interpreting
- Translation

Shared lifecycle:

- Request/imported
- Quoted/opened
- Assigned/proposed
- Accepted/booked
- Delivered/completed
- Timesheet/evidence received
- Ready for invoice
- Invoiced
- Paid

Translation-specific needs:

- word count;
- document attachment;
- deadline;
- delivery confirmation;
- translator assignment;
- translation invoice views;
- attachment weight / document metrics if needed.

Interpreting-specific needs:

- date/time;
- duration;
- onsite/online/phone;
- travel/location;
- interpreter attendance;
- timesheet.

Both converge in Finance:

- client invoice;
- interpreter/translator invoice;
- payment;
- profit.

## Navigation Proposal

Keep the main sidebar simple:

- Dashboard
- Operations
- Interpreters
- Clients
- Finance
- Messages
- Settings

Operations contains:

- Jobs Board
- Requests
- Assignments
- Schedule
- Exceptions
- Operational reports

Finance contains:

- Finance Board
- Client Invoices
- Interpreter Invoices
- Payments
- Timesheets
- Profit Review
- Finance Exceptions

## Shared Grid Engine

To avoid rebuilding the same thing twice, create one reusable CRM grid engine:

- saved views;
- favorite views;
- draggable view ordering;
- hidden fields;
- filters;
- grouping;
- sorting;
- pagination;
- row actions;
- bulk actions;
- column presets;
- context menu;
- double-click behavior.

Then configure it per workspace:

- Operations preset.
- Finance preset.

This gives consistency without forcing both teams into the same UI.

## View Ownership

Saved views should support:

- system views;
- shared team views;
- personal views;
- favorites;
- manual order;
- workspace scope:
  - operations;
  - finance;
  - global.

Each view should store:

- name;
- workspace;
- filters;
- hidden columns;
- column order;
- sort;
- group;
- favorite flag;
- owner;
- shared/private flag.

## Role-Based Default Experience

Charlie should land in Operations CRM by default.

Jerry should land in Finance CRM by default.

Admins can access both.

Future permissions:

- Operations staff can edit job/assignment fields.
- Finance staff can edit billing/invoice/payment fields.
- Super admin can edit everything.

## Data Governance

Use one source of truth.

Never create separate finance jobs and operations jobs.

Instead:

- one job record;
- operational status;
- billing status;
- invoice links;
- timesheet links;
- payment links;
- audit history.

This prevents the Airtable problem where related data lives in multiple tables and must be manually reconciled.

## Implementation Phases

### Phase 1: Define Workspace Model

- Add workspace scope to booking views.
- Define Operations views.
- Define Finance views.
- Decide default columns for each workspace.
- Decide which actions appear in each workspace.

### Phase 2: Reusable CRM Grid

- Extract current Jobs Board grid into reusable component.
- Support workspace configuration.
- Support saved view scope.
- Support column presets.
- Support workspace-specific row actions.

### Phase 3: Operations CRM

- Refine existing Jobs Board as Operations CRM.
- Remove finance-heavy actions from default Operations views.
- Keep handoff statuses visible.
- Optimize for assignment and delivery.

### Phase 4: Finance CRM

- Create Finance Board using same grid engine.
- Add finance views.
- Add invoice/timesheet/payment columns.
- Add finance actions.
- Add totals/footer where needed.

### Phase 5: Airtable Mirror Alignment

- Map Airtable Bookings views to Operations workspace.
- Map Airtable Accounts/Invoices views to Finance workspace.
- Ensure imported records populate all required finance fields.
- Preserve Airtable job number and invoice references for audit.

### Phase 6: Permissions & Personalization

- Add default landing page per staff role.
- Add personal views.
- Add shared team views.
- Add favorite view management.
- Add protected system views.

### Phase 7: Reports Layer

- Operations reports:
  - unassigned volume;
  - overdue assignment;
  - interpreter response time;
  - cancellation trends.

- Finance reports:
  - revenue;
  - unpaid invoices;
  - margin;
  - invoice aging;
  - interpreter payable totals.

## Key UX Rule

Operations and Finance should feel like focused CRMs, not generic dashboards.

The user should enter the workspace and immediately see:

- the records they own;
- the next action;
- the risk/priority;
- the views they use every day;
- no unnecessary white space;
- no decorative cards in dense work areas.

## Recommendation

Implement this after the current Jobs Board foundation is stable.

The correct direction is:

1. Finish Jobs Board grid quality.
2. Make saved views robust.
3. Add workspace scope to views.
4. Convert Jobs Board into Operations CRM.
5. Build Finance CRM using the same grid engine.
6. Map Airtable Accounts views into Finance views.
7. Add permissions and default landing by staff role.

