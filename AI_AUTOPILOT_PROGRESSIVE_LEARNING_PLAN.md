# AI Autopilot & Progressive Learning Plan

Bookmark: AI_AUTOPILOT_PROGRESSIVE_LEARNING_FUTURE_PHASE

## Implementation Status - 17 July 2026

The governed Autopilot engine is implemented. Production activation remains deliberately off, paused and simulation-first until Lingland completes its operational readiness checks.

### Completed And Verified

- [x] Admin AI Control Center with Control, Suggestions, Executions, Runs and Audit workspaces.
- [x] Server-enforced modes: `OFF`, `READ_ONLY_AUDIT`, `SUGGEST`, `ASSISTED`, `CONTROLLED_AUTOPILOT` and `FULL_AUTOPILOT`.
- [x] First advanced-mode activation requires exact Super Admin acknowledgement.
- [x] Moving from simulation to live platform writes requires a separate exact acknowledgement.
- [x] External communication is independently disabled by default and requires Full Autopilot plus exact confirmation.
- [x] DeepSeek adapter uses Firebase Secret Manager and never returns the key to the browser.
- [x] Provider context excludes names, emails, phones, addresses, notes and patient data.
- [x] Structured provider output is validated against known entities and a closed action registry.
- [x] Deterministic local rules work when DeepSeek is not configured.
- [x] Findings cover assignment, overdue jobs, status consistency, billing gaps, invoice integrity, mirror conflicts, cost anomalies and process improvements.
- [x] Suggestion deduplication, human decision records, feedback reason codes and learning-memory aggregation.
- [x] Closed server action registry with risk, communication and reversibility metadata.
- [x] Deterministic tools for internal work tasks, internal alerts, reversible job hold, interpreter offer and draft client invoice creation.
- [x] Deterministic interpreter matcher rechecks language, service type, account state, availability, DBS evidence and schedule conflicts.
- [x] Execution policy revalidates mode, pause, confidence, approval, risk and limits immediately before acquiring the action lock.
- [x] Idempotent execution ledger, simulation plans, stale-execution recovery, outcome verification and audited rollback.
- [x] Scheduled review cycle with configurable scopes and interval, daily limits and emergency-pause enforcement.
- [x] Immutable AI run and audit trails with explicit execution and communication flags.
- [x] Firestore access restricted to administrators; writes are performed only by callable functions.
- [x] Contextual `?` manual documents daily workflow, modes, scopes, findings, safety and troubleshooting.
- [x] Eight-step guided tour covers Safety, Guardrails, Provider, Review, Suggestions, Executions, Runs and Audit.
- [x] Re-verify desktop, mobile, dark and light UI after the Autopilot control expansion.
- [x] Deploy the Autopilot functions, scheduler, hosting bundle and updated Firestore rules.

Deployed callables:

- `getAIControlState`
- `updateAIControlSettings`
- `testDeepSeekConnection`
- `runAIReview`
- `reviewAISuggestion`
- `executeAIAction`
- `rollbackAIAction`
- `verifyAIOutcomes`
- `submitAISuggestionFeedback`
- scheduled `runScheduledAIReviews`

Required initial production boundary after deployment:

- mode: `OFF` or `READ_ONLY_AUDIT` while validation continues;
- execution: disabled;
- simulation: enabled before any live-write trial;
- emergency pause: enabled;
- external communication: blocked;
- DeepSeek secret: configured in Firebase Secret Manager and verified as connected;
- no setting migration automatically activates Autopilot.

### Live Validation Evidence

- Desktop and 390 px mobile browser QA passed without page-level horizontal overflow; mobile findings use dedicated compact records.
- Light and dark themes were verified with the manual, eight-step tour and every workspace tab.
- Legacy callable payloads are normalized at the client boundary so missing Autopilot collections cannot crash the Control Center during a rolling deployment.
- A real Jobs review generated 25 read-only observations without changing jobs or sending communication.
- The observations exposed imported jobs with a financial status but no linked client invoice identifier.
- A second review completed with provider status `NOT_CONFIGURED` and created no duplicates.
- Runs and Audit record scope, mode, provider state, findings, actor role and result.
- The suggestion detail shows reason, expected benefit, evidence, data used and structured feedback.

### Remaining Gates

- [x] Replace the sentinel with a real DeepSeek key and pass the provider connection test.
- [ ] Validate provider-generated findings against a controlled non-production dataset.
- [ ] Accumulate at least 30 days of reviewed suggestions and outcome feedback.
- [x] Implement reversible platform tools before enabling any execution.
- [x] Add action outcome verification and drift detection.
- [x] Implement scheduled reviews behind an off-by-default policy.
- [ ] Add quantified cost/time impact measurement beyond execution outcome state.
- [ ] Upgrade the Firebase Functions runtime from deprecated Node.js 20 before 30 October 2026.
- [ ] Keep execution, scheduling and external communication disabled until all Go/No-Go criteria pass.

## Executive Position

The AI Autopilot must be treated as a future operational layer, not as a shortcut around the platform issues that still need to be fixed.

Before activating any autonomous AI mode, Lingland needs a stable operational foundation:

- Jobs Board usable as a true production workspace.
- Booking detail and edit flows unified and reliable.
- Airtable mirror/sync stable and auditable.
- Interpreter, client, invoice and timesheet records consistent.
- Hybrid/manual staff mode fully supported.
- Email and notification policies predictable.
- Billing states mapped correctly from job to invoice.
- Admin UI/UX cleaned up across core work areas.

Only after this foundation is reliable should the AI layer move from analysis to execution.

## Product Vision

Create an AI layer that progressively learns from Lingland operations and helps staff:

- assign jobs faster;
- reduce avoidable costs;
- reduce late assignments and unfilled jobs;
- detect billing leakage;
- identify process bottlenecks;
- suggest better workflows;
- suggest product/platform improvements;
- eventually execute safe operational actions under admin-controlled policies.

The AI should begin as an analyst and copilot, then mature into a controlled autopilot.

## Core Principle

The AI must never be a free agent with direct database control.

It should operate through controlled platform tools:

- read context;
- propose action;
- explain reason;
- estimate risk;
- request approval when needed;
- execute only through validated services;
- log every decision and result.

## Operating Modes

### 1. Off

AI disabled.

### 2. Read-Only Audit

AI reads operational data and produces findings only.

Examples:

- jobs without interpreter;
- assignments at risk;
- stale statuses;
- missing client billing data;
- jobs ready for invoice but not invoiced;
- Airtable/platform mismatches;
- repeated manual corrections by staff.

### 3. Suggest Mode

AI suggests actions but staff must approve.

Examples:

- recommended interpreter;
- proposed status correction;
- draft client/internal message;
- suggested invoice grouping;
- suggested process improvement.

### 4. Assisted Mode

AI can execute low-risk internal actions and asks approval for sensitive ones.

Allowed examples:

- create internal alerts;
- prepare invoice drafts;
- flag job inconsistencies;
- draft messages;
- recommend reassignment.

Approval required:

- external emails;
- interpreter assignment;
- status changes affecting billing;
- invoice issuance;
- payment status changes.

### 5. Controlled Autopilot

AI can execute selected operational actions under strict rules.

Examples:

- assign low-risk jobs when confidence is high;
- send internal notifications;
- move jobs through safe internal states;
- create finance review queues;
- prepare billing drafts.

### 6. Full Autopilot

The engine and policy controls are implemented, but operational activation remains a future decision. It requires a long history of successful assisted operation, audit confidence and verified rollback evidence.

## Progressive Learning Strategy

The AI should learn from operational history, but learning must be controlled and explainable.

### What The AI Learns From

- historical jobs;
- successful assignments;
- declined assignments;
- interpreter response times;
- interpreter reliability;
- cancellation patterns;
- late jobs;
- non-executed jobs;
- billing corrections;
- invoice delays;
- staff overrides;
- Airtable sync corrections;
- user feedback on AI recommendations.

### Learning Signals

Each AI suggestion/action should record:

- recommendation;
- confidence score;
- reason;
- expected outcome;
- admin decision;
- actual result;
- whether the result was good, neutral or bad;
- cost impact;
- time impact;
- operational risk.

### Feedback Loop

Staff should be able to mark AI suggestions as:

- useful;
- wrong;
- too risky;
- missing context;
- good but not now;
- should become a rule.

This feedback becomes structured training memory for future decisions.

## AI Memory Model

Use three layers of memory.

### 1. Operational Facts

Structured data from the platform:

- jobs;
- clients;
- interpreters;
- invoices;
- timesheets;
- messages;
- status history;
- sync history.

### 2. Policy Memory

Admin-configured rules:

- when to assign directly;
- when to send proposals;
- preferred interpreters by client/language;
- blocked combinations;
- email restrictions;
- billing thresholds;
- approval requirements.

### 3. Learning Memory

AI-generated insights and staff feedback:

- interpreter reliability patterns;
- cost-saving opportunities;
- recurring UI friction;
- workflow inefficiencies;
- recommended automations;
- product backlog candidates.

## Cost Reduction Opportunities

The AI should actively look for savings.

Examples:

- suggest closer onsite interpreters to reduce travel cost;
- detect repeated high-cost interpreters where alternatives exist;
- identify clients/jobs with frequent cancellations;
- detect late assignment patterns by language or client;
- suggest better default rates;
- detect jobs where duration estimates are repeatedly inaccurate;
- identify billing leakage where completed work was not invoiced;
- suggest batching invoices;
- detect duplicate admin work caused by bad UI or missing automation.

## Platform Improvement Suggestions

The AI should not only operate the business. It should also observe the platform.

It can suggest:

- UI screens causing repeated staff mistakes;
- fields that are often missing or corrected;
- statuses that confuse users;
- modals/pages that interrupt flow;
- automation candidates;
- new filters/views for Jobs Board;
- missing columns in operational tables;
- better billing dashboards;
- better onboarding checkpoints.

These should go into an `AI Product Insights` queue, not directly change the app.

## Required Platform Components

### AI Settings

Admin section for:

- Autopilot mode;
- DeepSeek credential status (the key remains in Firebase Secret Manager);
- model selection;
- communication policy;
- approval rules;
- risk thresholds;
- daily action limits;
- emergency pause;
- audit log access.

### AI Action Registry

A controlled list of actions the AI can request.

Examples:

- `reviewJobs`
- `suggestInterpreter`
- `assignInterpreter`
- `recordInterpreterAccepted`
- `recordInterpreterDeclined`
- `prepareClientMessage`
- `sendInternalNotification`
- `prepareInvoiceDraft`
- `flagBillingIssue`
- `createProcessImprovement`

### AI Audit Log

Every AI event must store:

- timestamp;
- user/admin context;
- mode;
- input summary;
- recommendation;
- selected tool/action;
- risk level;
- confidence;
- approval status;
- result;
- rollback availability.

### AI Suggestions Queue

Central workspace for:

- operational suggestions;
- billing suggestions;
- communication suggestions;
- process improvements;
- UI/UX product insights.

### AI Run Console

Admin can run:

- job review;
- billing review;
- sync review;
- interpreter allocation review;
- cost optimization review;
- platform improvement review.

## DeepSeek Integration Architecture

Recommended structure:

- `AIOrchestratorService`
- `DeepSeekClient`
- `AIToolRegistry`
- `AIPolicyEngine`
- `AIRiskEngine`
- `AIAuditService`
- `AISuggestionService`

The AI should call tools, not database writes.

Flow:

1. Admin triggers AI review or scheduled job runs.
2. Platform builds safe context.
3. DeepSeek receives structured prompt and available tools.
4. AI returns proposed actions.
5. Policy engine classifies risk.
6. Suggestions are displayed or executed depending on mode.
7. Result is audited.
8. Staff feedback becomes learning memory.

## Risk Levels

### Low Risk

- internal notes;
- internal alerts;
- process suggestions;
- draft generation;
- read-only analysis.

### Medium Risk

- assignment suggestion;
- status recommendation;
- invoice draft;
- message draft.

### High Risk

- external email;
- confirmed assignment;
- billing status change;
- invoice sent;
- payment marked;
- cancellation;
- deletion or destructive changes.

High-risk actions must require approval until the platform has strong operational confidence.

## Implementation Phases

### Phase 0: Stabilize Core Platform

Do this before AI implementation.

- Finish Jobs Board UX.
- Finish Booking Detail/Edit consistency.
- Finish migration/sync reliability.
- Finish client import.
- Finish invoice import.
- Finish manual staff mode.
- Finish notification/email safety.
- Fix mobile/dark mode problems in core admin and app pages.

Exit criteria:

- staff can operate daily jobs without Airtable for review;
- data status is consistent;
- billing flow is traceable;
- UI does not block operations.

### Phase 1: AI Read-Only Auditor - Implemented

Build:

- AI Settings page;
- DeepSeek connection;
- AI Audit Log;
- manual `Run AI Review`;
- Jobs Board AI findings panel.

No automatic execution.

### Phase 2: Suggestion Engine - Implemented For Current Registry

Build:

- interpreter suggestions;
- billing suggestions;
- status correction suggestions;
- internal communication drafts;
- cost-saving suggestions.

Admin approves all actions.

### Phase 3: Learning Feedback - Core Implemented

Build:

- accept/reject feedback;
- reason codes;
- outcome tracking;
- AI learning memory;
- weekly operational insight report.

### Phase 4: Assisted Automation - Engine Implemented, Activation Gated

Allow low-risk actions:

- internal alerts;
- draft invoices;
- draft messages;
- create improvement suggestions;
- flag anomalies.

Still require approval for assignment, external email and billing state changes.

### Phase 5: Controlled Autopilot - Engine Implemented, Activation Gated

Allow scoped automation:

- direct assign only when policy allows;
- status changes only in safe paths;
- internal notifications automatic;
- invoice drafts automatic;
- external communication only if enabled by admin policy.

### Phase 6: Continuous Optimization - Pending

AI generates:

- monthly cost report;
- platform friction report;
- interpreter performance insights;
- client profitability insights;
- process improvement backlog;
- UI/UX recommendations.

## UI/UX Requirements

AI should never feel like a black box.

Each suggestion must show:

- what it wants to do;
- why;
- confidence;
- risk;
- data used;
- expected benefit;
- approval button;
- dismiss button;
- feedback button.

Avoid large chat-only interfaces for operations. The AI should live inside the workflow:

- Jobs Board;
- Booking Detail;
- Interpreter profile;
- Client profile;
- Billing hub;
- Settings.

## Go/No-Go Criteria

Do not activate Autopilot execution until:

- imported data is reliable;
- job statuses are mapped correctly;
- invoices and timesheets are consistent;
- admin can manually override every AI action;
- audit logs are complete;
- email policy is proven;
- staff trust the Jobs Board;
- at least 30 days of AI suggestions have been reviewed.

## Recommended First Build When Ready

Start with:

1. AI Settings.
2. DeepSeek API connection test.
3. Read-only job review.
4. AI suggestions table.
5. Audit log.
6. Staff feedback on suggestions.

This gives immediate value without risking live operations.
