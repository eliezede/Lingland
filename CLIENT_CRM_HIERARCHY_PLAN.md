# Client CRM Hierarchy Implementation Plan

<a id="client-crm-hierarchy-plan"></a>

## Objective

Replace the current contact-shaped client records with a durable hierarchy:

1. **Client** - the legal or operational organisation.
2. **Department** - a service, ward, team, branch, cost centre, or business unit inside the client.
3. **Agent** - the person who requests and manages work.

The migration must preserve every job, invoice, account permission, Airtable identity, and audit trail. Existing records remain readable throughout the transition.

## Non-negotiable identity rules

- An email address identifies an **agent or mailbox**, never an organisation by itself.
- Organisation matching uses, in priority order: Sage account reference, stable Airtable client key, exact normalised organisation name plus postcode, then exact normalised organisation name for manual review.
- Generic names such as `Client`, `Airtable Client`, `NHS`, `Unknown`, or `Home` are not organisation identity evidence.
- Shared mailboxes such as `accounts@`, `bookings@`, `finance@`, and `reception@` are always reviewed by a person.
- No destructive merge is allowed without a dry run, explicit canonical record, dependency counts, conflict report, and rollback manifest.
- Airtable remains a source reference during Mirror/Hybrid Mode, but platform IDs become the durable relationship keys.

## Target data model

### `clients`

One record per organisation. It owns legal name, aliases, Sage reference, billing policy, addresses, status, and source identities. It does not own a person's login.

### `clientDepartments`

One record per department, linked by `clientId`. It owns department name, location, cost-code defaults, booking defaults, billing routing, and status.

### `clientAgents`

One record per person or explicitly classified shared mailbox. It owns name, normalised email, phone, status, and optional `userId`. Agent identity is independent from organisation identity.

### `clientMemberships`

Joins an agent to a client and optional department. It stores access scope:

| Access level | Visibility |
| --- | --- |
| `AGENT` | Own requests and records explicitly shared with the agent |
| `DEPARTMENT_MANAGER` | All work for assigned departments |
| `CLIENT_FINANCE` | Client invoices and finance records for assigned scope |
| `CLIENT_MASTER` | All departments, agents, jobs, and invoices for the client |

### Booking contract

New and migrated jobs must carry:

- `clientId`
- `clientDepartmentId` when known
- `requestedByAgentId` when known
- `requestedByUserId` when submitted from an account
- immutable organisation, department, and requester snapshots for historical display

Invoices continue to link to `clientId`; optional department and agent references support routing and reporting without fragmenting the financial account.

## Migration gates

### Phase 1 - Identity audit (read-only)

- [x] Define organisation, department, agent, membership, and booking contracts.
- [x] Build deterministic organisation candidate detection without email-based organisation merges.
- [x] Build duplicate-agent detection by normalised contact/booking email.
- [x] Flag shared mailboxes, conflicting Sage references, and conflicting postcodes.
- [x] Calculate affected jobs, invoices, and linked user accounts.
- [x] Recommend a canonical record without changing data.
- [x] Expose a read-only Client Identity Audit in the admin CRM.
- [x] Review the first real audit output and use its false-positive risks to tighten the merge gates.
- [x] Add corroborating signals from aliases, postcode, billing address, phone, and specific organisation domains.
- [x] Exclude public and broad domains such as Gmail and `nhs.net` from organisation matching.

### Phase 2 - Canonical mapping and merge preparation

- [x] Add persistent review decisions: reject, split, defer, reopen, review history, and deterministic exclusion of rejected/split record pairs.
- [x] Add persistent Airtable identity mappings for `Clients`, `Clients Book`, and `Departments`, with audited `MAP_TO_CLIENT` and Super Admin-only `APPROVE_NEW_CLIENT` decisions.
- [x] Block Airtable Write Sync server-side whenever the exact dry run contains an unresolved client identity decision.
- [x] Create canonical client, department, agent, and membership manifests with backups and rollback ownership markers.
- [x] Preview every protected client field winner and conflict before a write.
- [x] Produce dependency rewrite counts, concurrency fingerprint, backups, and tested rollback payload.
- [x] Require a second active Super Admin approval for high-risk groups and material financial/dependency footprints.

### Phase 3 - Non-destructive migration

- [x] Create canonical hierarchy records before redirecting source clients.
- [x] Reassign client relationships in jobs, client invoices, timesheets, and interpreter invoice lines without rewriting historical display snapshots.
- [x] Add department and requester relationship fields to bookings and populate them when evidence is deterministic.
- [x] Extend department, agent, and membership relationships to invoices, chats, notifications, and users. New invoice paths and lifecycle notifications now persist hierarchy scope; historical finance repair remains an explicit reviewed backfill.
- [x] Dual-read the legacy client contact and the new hierarchy in the admin Client CRM while backfilling.
- [x] Write a merge manifest, source snapshots, dependency ledger, and audit event for every executed consolidation.
- [x] Execute the production read-only finance dry run and record its fingerprint, deterministic updates, blockers, and unlinked records without applying writes.
- [ ] Resolve every blocked invoice/job scope and re-run the dry run until the blocker count is zero.
- [ ] Reconcile post-write counts and financial totals before enabling new access rules. The reviewed bulk application remains disabled while blockers exist.

### Phase 4 - Accounts and permissions

- [ ] Replace `users.profileId` client access with membership-based scope. Portal reads/actions now use membership scope; `profileId` remains only as cutover compatibility until Firestore rules are tightened.
- [ ] Update Firestore rules for agent, department manager, finance, and client master access.
- [ ] Add invitation and activation flows that attach a user to an existing agent safely. Passive preparation, membership linking and provisional-ID to Auth-UID repair are complete; activation email/go-live validation remains.
- [ ] Add master-agent administration for departments and subordinate agents.
- [ ] Verify least-privilege access with emulator tests.

### Phase 5 - Booking and staff workflows

- [ ] Update public and authenticated booking forms: Client -> Department -> Agent. The authenticated portal now resolves the signed-in membership and records canonical client, department, agent, user and immutable snapshots; public intake remains.
- [ ] Allow authorised users to request a new client or department without creating duplicates automatically.
- [ ] Give staff full manual control to select, create, or repair hierarchy links. Department and agent membership management, booking editor selectors, invoice identity repair and blocked-job hierarchy repair are complete; inline creation requests and the final production repair pass remain.
- [x] Update Airtable sync to resolve organisations deterministically and report unresolved client/invoice identities without creating finance-owned client records.
- [x] Add a Client CRM staging workspace to the Airtable Sync Center with canonical-client search, source-record evidence, durable mappings, and a zero-blocker write gate.
- [x] Add explainable canonical-client recommendations using stable account references, organisation aliases, UK postcodes, addresses, phones, and specific corporate domains. Public/shared domains such as `nhs.net` never identify an organisation.
- [x] Add an explicit batch-review path for unique high-confidence recommendations only. It maps to existing clients, is capped at 25, revalidates canonical records server-side, and writes a separate audit event for every mapping.
- [x] Add a separate Super Admin manual-batch path for reviewed families. It maps 1-25 unresolved `Clients Book` or `Departments` scopes to one existing canonical client, binds the selection to the same actor and recent Clients Dry Run, rejects changed source evidence, and commits mappings plus audit events atomically.
- [x] Deploy the recommendation contract and run a fresh production `Clients / Full audit` against contract `airtable-sync-center-v8`.
- [ ] Review every remaining client, department and generic-identity decision; keep Write Sync locked until the blocker count reaches zero.
- [ ] Preserve the manual/hybrid operating model when an agent has no active account.

### Phase 6 - Cutover and cleanup

- [ ] Run parallel reconciliation against Airtable and current production records.
- [ ] Confirm job, invoice, and account totals at every hierarchy level.
- [ ] Enable membership-based reads, then stop creating legacy contact-shaped clients.
- [ ] Keep aliases and migration ledger permanently for auditability.
- [ ] Archive superseded records only after the rollback window closes.
- [ ] Upgrade the Functions runtime before the Node.js 20 decommission date (30 October 2026) and repeat the callable/event-trigger regression suite.

## Merge safety checklist

Before any merge can execute:

- [ ] Canonical client selected explicitly.
- [ ] Sage and Airtable identifiers have no unresolved conflict.
- [ ] Billing address and invoice route reviewed.
- [ ] Departments mapped or deliberately left unassigned.
- [ ] Agents classified as person or shared mailbox.
- [ ] Jobs, invoices, chats, and user account impacts displayed.
- [ ] Current access scope and future membership scope compared.
- [ ] Backup manifest written and checksum recorded.
- [ ] Dry-run counts equal post-write counts.
- [ ] Rollback procedure tested in an emulator or staging project.

## REDBOOK mirror identity staging

The REDBOOK client import now treats the three Airtable sources according to their real business role:

- `Clients` is the canonical account register and may propose a new organisation only after an explicit review.
- `Clients Book` contains requesters and contact rows. It projects agents, memberships, departments and aliases; it cannot silently create an organisation.
- `Departments` contains operational units. An orphan department must be assigned to an existing canonical client before a write is allowed.

Manual review decisions are stored in `airtableClientIdentityMappings` and reused by every later mirror cycle. Mapping to an existing client is available to authorised admins. Approving a genuinely new organisation requires a `SUPER_ADMIN`. Every decision writes an `auditEvents` record. A mapping to an archived, redirected, deleted or otherwise unavailable client becomes a new blocker instead of silently falling back to name matching.

### Validated full-audit evidence - 22 July 2026

- Mapping contract: `airtable-sync-center-v7`.
- Dry-run ID: `E7g2t4on66ZhulzP3OcF`.
- Scope: `clients`, `FULL_AUDIT`, limit `5,000`.
- Source rows: 51 `Clients`, 1,177 `Clients Book`, and 60 `Departments`.
- Projection: 367 canonical organisations, 12 departments, 1,090 agents and memberships.
- Result: 8 proposed creates, 410 updates, 138 conflicts, 0 errors.
- Write gate: **locked** with 146 unresolved identity decisions.
- Blockers: 8 canonical account creates, 80 new-organisation reviews, 56 orphan departments, 1 ambiguous canonical client, and 1 generic organisation identity.
- Browser verification: desktop and 390 px mobile layouts have no global horizontal overflow; canonical search works; Write Sync remains disabled; the final rerun produced no React errors or warnings.
- Test evidence: frontend production build passed, Functions TypeScript build passed, and 190/190 automated tests passed.
- Production effect: no client mapping and no Write Sync was executed during validation. Email policy remains `SUPPRESSED`; the scheduled mirror configuration was not changed.

### Explainable recommendation sprint - 22 July 2026

- Recommendations are advisory data attached to unresolved `Clients Book` and `Departments` identities; they never resolve a conflict or permit Write Sync by themselves.
- The recommendation release uses mapping contract `airtable-sync-center-v8`; every batch is bound to the exact Clients Dry Run, actor and recommended target for 30 minutes. Contract v7 runs cannot authorise this workflow.
- `HIGH` requires a unique strong target. A close competing target downgrades the result to `MEDIUM`, which cannot enter batch review.
- Batch review supports only `MAP_TO_CLIENT`. `APPROVE_NEW_CLIENT` remains an individual `SUPER_ADMIN` decision.
- Every batch requires an active admin, explicit confirmation, 1-25 unique source scopes, `HIGH` confidence, a recent matching Dry Run, and an active canonical client. The write and its audit events are committed together.
- A repeatable read-only Airtable audit inspected 51 `Clients`, 1,177 `Clients Book`, and 60 `Departments`. Against the canonical Airtable account register it found 9 unique strong recommendations, 21 medium suggestions, and left the rest manual. These are pre-deployment aggregate estimates; the authoritative count must come from the next production Full Audit because the live resolver also considers existing Firestore identities and durable mappings.
- Automated coverage includes stable-account matches, public-domain exclusion, address-only manual review, close-target downgrade, confirmation, role, confidence, creation, duplicate-scope, batch-size, expired-run, changed-actor and changed-target policies.
- Local release evidence for contract `v8`: 35 test files and 201 tests passed; the frontend typecheck/production bundle and the Functions TypeScript build both passed; `git diff --check` reported no whitespace errors.
- No mapping, client creation, Write Sync, email, or scheduled-sync configuration was changed during this audit.

### Validated v8 recommendation audit - 22 July 2026

- Commit `b4d250e` was deployed to Firebase Functions and Hosting and pushed to `origin/main`.
- Authoritative Dry Run ID: `6Q4rup8GOs1oGj39iCxK`.
- Contract and scope: `airtable-sync-center-v8`, `clients`, `FULL_AUDIT`, limit `5,000`.
- Source read: 1,288 records covering 51 canonical Client accounts, 1,177 Clients Book rows and 60 Departments rows.
- Result: 8 proposed creates, 410 updates, 138 conflicts and 0 errors; the hierarchy projection remains 367 clients, 12 departments and 1,090 agents.
- Review gate: 146 identity decisions remain and Write Sync stayed disabled. The authoritative resolver exposed 4 `HIGH` recommendations whose targets already exist in Client CRM; none was selected or saved.
- Production effect: the deployment changed application code only. The validation did not write a mapping, create or merge a client, execute Write Sync, send email, or change the scheduled mirror configuration.

### Canonical account review sprint - 22 July 2026

- Four unique `HIGH` recommendations were accepted first: Hampshire County Council AMHP to Hampshire County Council, Carlton Place Law department to Carlton Place Law, Churchers Solicitors department to Churchers Solicitors, and Roach Pittis department to Roach Pittis. A fresh Full Audit reduced the write blockers from 146 to 142 without errors.
- Six active records from the official Airtable `Clients` account register were individually approved as future canonical organisations because each has a unique Sage reference and no existing canonical client match: Biscoes Solicitors (`BIS001`), Bramsdon & Childs Solicitors (`BCS001`), Davies Blunden and Evans (`DAV001`), NHS Hampshire and Isle of Wight Integrated Care Board (`HSI002`), Solent NHS Trust (`SOL002`), and Southampton AMHP service (`SOU009`).
- Footner & Ewing Solicitors (`FOO001`) was mapped to the single existing `Footner Ewing` client (`airtable_client_footner-ewing`) so the official account data can enrich the record that already owns the operational history.
- Hampshire Hospitals NHS Foundation (`HAM013`) and the ambiguous `Clients Book` identity `Hampshire Hospitals` were mapped to `airtable_client_hampshire-hospitals-nhs-foundation-trust` only after dependency review. That exact-name record already owns 41 jobs and 3 invoice headers; the related 19-record identity group contains 121 jobs and 5 invoice headers with no linked portal user.
- The generic `Clients Book` identity `NHS` was not mapped by its display name or by the broad `nhs.net` domain. All nine source rows use the specific `hhft.nhs.uk` organisation domain and include HHFT/RHCH finance and requester signals, so the group was mapped to the same Hampshire Hospitals canonical client.
- Authoritative post-review Dry Run ID: `tdQkYCzXsUTjKp9A4g5O`, completed 22 July 2026 at 20:52:30 using `clients`, `FULL_AUDIT`, limit `5,000`, and mapping contract `airtable-sync-center-v8`.
- Final preview: 6 creates, 412 updates, 132 conflicts, 0 errors, 367 canonical clients, 15 departments, 1,118 agents and 132 unresolved identity decisions.
- Safety state: Write Sync remains disabled. No Airtable record, client document, merge, email, scheduled-sync configuration, or finance record was written; only audited identity mapping decisions were stored in Firestore.

The read-only Hampshire Hospitals merge preview confirms that consolidation must wait until after the Clients Write Sync. It covers 19 client records, 121 jobs, 2 client-invoice relationships to reassign, 73 timesheets and 196 dependent records. It would preserve 11 departments, 20 agents and 20 memberships, with deterministic department coverage for 27 jobs and requester coverage for 112 jobs; 2 hierarchy links still require review. Two functional shared mailboxes remain unassigned to historical jobs by design. The merge requires a second active Super Admin.

The current canonical still has an empty Sage reference and invoice route in Firestore. The official Airtable account provides `HAM013`, `sbs.apinvoicing@nhs.net` and the RNS Payables address at Phenix House, Wakefield. Requesting merge approval now would freeze stale field winners such as `Address Pending Update`; therefore no approval was requested and no merge was executed.

### Guarded manual-batch review - 22 July 2026

- Commit `f068049` added and deployed `saveAirtableClientIdentityMappingsManualBatch` plus the Airtable Sync Center selection UI. The existing high-confidence recommendation batch was not weakened or repurposed.
- Manual batches require an active `SUPER_ADMIN`, explicit confirmation, 1-25 unique unresolved scopes, one shared existing canonical target, a successful Clients Dry Run from the same actor and mapping contract within 30 minutes, and source-name evidence identical to that run.
- The callable rejects canonical records that are missing or archived and refuses to overwrite an active mapping created after the reviewed Dry Run. Every stored mapping carries `reviewMethod = MANUAL_BATCH`, its review run ID, actor and timestamp; the mapping and matching `auditEvents` entry are committed together.
- Desktop, dark-mode and 390 x 844 browser checks covered entry/cancel, selection persistence, the 25-row cap, canonical search, modal close, and responsive layout. No test selection was saved.
- The first production-data batch mapped 25 explicitly verified Hampshire Hospitals identities to `airtable_client_hampshire-hospitals-nhs-foundation-trust`. Evidence was read directly from Airtable and consisted of the specific `hhft.nhs.uk` domain, explicit Hampshire Hospitals/HHFT naming, or a corresponding RHCH/Basingstoke hospital finance address.
- Mixed or weak identities such as `HHFT/Southernhealth`, `Hnft`, generic hospital names and unrelated NHS domains were deliberately excluded.
- Before-run ID: `CJNr9mYQPG3vGeHkMhU5`, completed 22 July 2026 at 21:09:14 with 132 conflicts.
- Authoritative after-run ID: `rEmLkwFttpWpFxdRCGsI`, completed 22 July 2026 at 21:20:23 using `clients`, `FULL_AUDIT`, limit `5,000`, and contract `airtable-sync-center-v8`.
- After-run result: 6 creates, 412 updates, 107 conflicts, 0 errors. The blocker reduction is exactly 25, matching the reviewed batch; Write Sync remains locked.
- Validation evidence: 35 test files and 205 tests passed, both frontend and Functions production builds passed, and `git diff --check` passed.
- Production effect was limited to 25 audited Firestore identity mappings. No Airtable record, client merge, Client Write Sync, finance document, email, notification policy, or scheduled mirror configuration was changed. Platform Mode remained `HYBRID`, Airtable Import `ON`, and communication `SUPPRESSED`.

### Hampshire Hospitals hierarchy extension - 22 July 2026

- A second production-data review mapped 24 unique `Clients Book`/`Departments` scopes to `airtable_client_hampshire-hospitals-nhs-foundation-trust`. One mapping scope represented two Airtable rows named `RHCH Nick Jonas Ward`, so the batch resolved 25 source blockers without submitting a duplicate decision.
- The five reviewed `Clients Book` identities were Andover War Memorial Hospital Pre-assessment Clinic, Basimgstoke Hospital, Hnft, Royal Hampshire County Hospital Winchester - Orthopaedics, and Winch Hampshire Hospitals NHS Foundation Trust. Each had explicit Hampshire Hospitals naming or an `hhft.nhs.uk` requester linked to the same institution family. `Hnft` was admitted only in this second pass after the additional source-row evidence was checked; it was correctly excluded from the first, narrower batch.
- The reviewed department scopes were Andover Endoscopy, Orthoptist and Upper GI; Basingstoke Breast & Radiotherapy Oncology, Cardiology, DTC, Fracture clinic, Haematology, Head and Neck, Maternity and Opthalmology; and RHCH Endoscopy, Nick Jonas Ward, Ophthalmology, Radiology, Surgical Unit Office, Treatment Center, Upper GI and Women's Health.
- `HHFT/Southernhealth` remained excluded because its requester uses `southernhealth.nhs.uk`. Generic HCC, Hampshire Heart Centre, unrelated NHS/court/council rows and any department without explicit institution evidence also remained unresolved.
- Before-run ID: `1yeV8jP2LxGTSaQwX91q`, completed 22 July 2026 at 21:33:32 with 107 conflicts.
- Authoritative after-run ID: `aQ6UgDlzCmvncFPRSDcK`, completed 22 July 2026 at 21:39:24 using `clients`, `FULL_AUDIT`, limit `5,000`, and contract `airtable-sync-center-v8`.
- After-run result: 82 conflicts and 0 errors. The exact reduction of 25 matches the 25 blocked source rows covered by the 24 unique mapping scopes.
- The review UI now deduplicates rows and outgoing manual-batch payloads by `sourceTable + groupKey`. Repeated Airtable records sharing one decision scope are displayed and submitted once while the server's blocker count continues to represent every blocked source row.
- Repeat validation run `nClx6ZO3Og7b2hHba3n5`, completed 23 July 2026 at 06:42:50, remained clean with 82 blocked source rows and 79 unique review decisions. This proves the mappings are durable and the UI now explains the record/decision difference explicitly.
- Validation evidence: 36 frontend test files and 207 tests passed, the frontend typecheck/production bundle and Functions TypeScript build passed, and `git diff --check` reported no whitespace errors.
- Production effects were limited to the 24 audited Firestore identity mappings. No Airtable record, client merge, Client Write Sync, finance document, email, notification policy, or scheduled mirror configuration was changed. Platform Mode remained `HYBRID`, Airtable Import `ON`, and communication `SUPPRESSED`.

#### Next identity-review queue

- [ ] After the zero-blocker Clients Write Sync, rerun the Hampshire Hospitals merge preview and verify that `HAM013`, invoice email and billing address are present before requesting the mandatory second approval.
- [ ] Review the remaining proposed organisations and classify each as canonical client, alias/department, or rejected identity.
- [ ] Map all orphan departments to an existing canonical client; departments must never be approved merely to clear the gate.
- [ ] Re-run `Clients / Full audit` after each reviewed batch and record the new run ID and blocker delta.
- [ ] Execute Write Sync only after the server reports zero identity blockers and a fresh single-use approval is available.

### Operator procedure

1. Open `Administration -> Airtable Sync Center -> Clients` and select `Full audit`.
2. Run `Dry Run`. Do not use a previous run or a different module/strategy as write evidence.
3. Review canonical account creates first. Use `Map existing` for aliases or duplicates; use `Approve new` only for a verified legal or operational organisation.
4. Resolve ambiguous and generic identities against an existing canonical client.
5. Assign every orphan department to its parent client. A department is never approved as a new client merely to clear the queue.
6. Rerun the same dry run after each review batch. The blocker total must reach zero.
7. Confirm counts, finance ownership and the communication policy. Write approval is bound to the exact user, run, module, strategy, limit and mapping version for 30 minutes and is single-use.
8. Execute Write Sync only when both the UI and backend report `writeApproval.ready = true`.
9. Rerun the identity audit and compare client, department, agent, job and invoice totals before continuing to another module.

The backend rejects a write with `DRY_RUN_HAS_WRITE_BLOCKERS` even if a stale or modified frontend attempts to submit it. Client identity clearance is therefore a server-enforced prerequisite, not a visual convention.

## Current implementation boundary

Audit refresh remains deliberately **read-only**. Organisation consolidation is available only through a live preview and is non-destructive: the canonical client remains active, source records become redirects, relationship IDs are reassigned, and a rollback manifest is written first. Conflicting Sage identities and source records linked to portal users are blocked.

Identity review decisions are now durable operational records rather than temporary UI filters. Staff can defer a candidate with an optional revisit date, record that organisations are distinct, split a mixed candidate into explicit groups, and reopen any active decision. Rejected and split cross-group pairs are excluded deterministically from future audit runs, while stale decisions remain visible in review history instead of silently affecting changed data.

Material merges use a two-person rule. High-risk identity groups, previews with at least 100 dependent records, or previews containing at least 10 client invoices require a second active `SUPER_ADMIN`. Approval is bound to the exact candidate fingerprint, canonical client, selected field winners, and dependency snapshot for 24 hours. Requester and reviewer must be different accounts. Execution atomically reserves both the approval and a fingerprint-based execution lock before any migration write; completion consumes the approval, failure blocks retries until the manifest is inspected or restored, and rollback releases the reviewed path as `ROLLED_BACK`.

Staged deployments are fail-safe. A frontend receiving the previous audit contract normalises the missing decision history to an empty state; a merge preview missing the new approval-policy fields is treated as requiring approval and cannot execute. This prevents a temporary frontend/backend version mismatch from crashing the audit or bypassing the two-person gate.

The executable merge now creates and backs up departments, agents, shared mailboxes, and memberships before redirecting a source client. Historical jobs receive department/requester IDs only when deterministic evidence exists. Admins can create or edit departments and agent memberships from the canonical client profile through validated Cloud Functions; every manual hierarchy write creates an `auditEvents` entry. Institution-family matching can now join a named ward/site to its parent only when organisation-name evidence is corroborated by both the same normalised phone and the same specific email domain.

Membership-scoped portal reads, authenticated booking selection, cancellation and booking-linked support chat are now executable. Client invoice access uses department/requester scope whenever projected links exist; historical client-only invoices retain a controlled compatibility path until the reviewed backfill is applied. Direct Firestore client reads remain temporarily available for the currently deployed legacy frontend and must be removed in the same release that publishes the new callable-based portal.

New client invoices generated by staff, scheduled finance, AI, or Airtable now use one tested hierarchy projector. Invoice headers carry all linked job, department, requester-agent, and requester-user IDs plus a coverage state; each invoice line carries the exact scope of its source job. Timesheet submission also snapshots the booking hierarchy so later finance processing does not need to infer identity from display text.

The Client Identity Audit now has a separate hierarchy-integrity gate. It checks missing and redirected client links, cross-client departments, requester memberships, user mismatches, orphan invoice lines, notification recipients, and the exact number of invoice/header lines requiring repair. `reconcileClientFinanceHierarchy` is read-only by default; writes require Super Admin, the reviewed fingerprint, and the phrase `RECONCILE CLIENT FINANCE`. Any invoice connected to jobs from different clients blocks the whole application. Before writing, the system stores every touched field in a reconciliation manifest; rollback restores only documents still owned by that manifest.

Client lifecycle notifications now resolve recipients from active memberships. Request updates go to the requester, in-scope department managers, and client masters; invoice events go to in-scope finance memberships and client masters. Passive imported accounts are excluded, and push delivery continues to obey Platform Mode communication policy.

The booking and client-invoice lifecycle listeners were deployed on 19 July 2026 as Firestore Functions Gen 2 in `europe-west1`, the supported pairing for the project's `eur3` database. The callable CRM endpoints remain in `us-central1` for backward-compatible client URLs. Both event resources are listed as active after deployment.

REDBOOK synchronisation now follows the same identity boundary as the CRM. Client organisations are resolved by source record, stable Airtable client key, Sage reference, or a unique exact normalised organisation name. Booking and finance email addresses no longer select or generate an organisation ID; they remain evidence for agent or shared-mailbox classification. Ambiguous invoice ownership is written as an explicit sync conflict and must be linked to a canonical client before financial reconciliation.

The legacy Airtable form webhook is now compatibility-only. It authenticates and records a hash-only receipt, then defers processing to REDBOOK sync; it cannot create a duplicate client/job, allocate an `LL-xxxx` number, or queue an email. Public booking intake applies the hierarchy at entry: exact organisation identity or a provisional organisation, separate requester and finance identities, inactive memberships pending staff verification, and immutable booking snapshots. Ambiguous organisation or agent identities remain visibly unresolved instead of being guessed from email.

An agent email becomes immutable in Client CRM once the agent or membership is linked to a portal user. The UI directs staff to user administration and the callable enforces the same rule, preventing Firebase Auth, `users`, `clientAgents`, and `clientMemberships` from diverging.

Production audit snapshot on 19 July 2026: 596 active client records, 138 organisation candidates, 30 repeated-agent candidates, 182 invoice headers and 201 invoice lines eligible for reviewed hierarchy backfill, 50 identity repairs, 87 blocked invoices, 508 critical links, and 66 warnings. No bulk finance reconciliation was applied during this validation cycle.

The production finance dry run was re-executed on 19 July 2026 with fingerprint `105b9423dd3bfb8396e6b5fd7587b7d2ee3790a9408144488b6315d1e6d44000`. It scanned 269 client invoices and 325 invoice lines, proposed 182 invoice updates and 201 line updates, inferred 50 exact client assignments, identified 146 client-level invoices without linked jobs, and stopped on 87 blocked invoices: 33 unresolved client identities and 54 invalid job scopes. No production document was written. Reconciliation now joins invoice lines, invoice booking IDs, and direct `booking.clientInvoiceId` links so a financially linked job cannot bypass the review gate. The repair queue distinguishes unresolved invoice identity, invalid booking hierarchy, multiple-client scope and missing booking links. Job-level repairs are fingerprinted, require a Super Admin and explicit reason when finance is linked, write a rollback manifest and job/audit events, and never modify the invoice during the repair itself.

## Validated pilot consolidation

On 18 July 2026, the first production-data consolidation was completed for the only candidate classified as `READY`:

- Canonical client: `airtable_client_churchers-solicitors` (`Churchers Solicitors`).
- Redirect source: `airtable_client_churchers-solicitors-llp` (`Churchers Solicitors LLP`).
- Evidence: shared Airtable client key, exact normalised organisation name, and specific `churchers.co.uk` domain.
- Impact: one source record consolidated, zero relationship rewrites, and no linked portal user.
- Rollback manifest: `VPKFK795lvNYGadz11T9`.
- Reconciliation: active client rows changed from 607 to 606; the canonical client remains visible, the redirect is hidden from the CRM list, and an old source URL resolves to the canonical profile.

This pilot validates the reversible merge path only. Candidates marked `REVIEW_REQUIRED` or `BLOCKED` must not be merged until departments, agents, financial conflicts, and account scopes have been mapped.

## Validated hierarchy consolidations

The following additional groups were reviewed field by field and consolidated on 18-19 July 2026:

| Canonical client | Structure preserved | Dependencies | Rollback manifest |
| --- | --- | ---: | --- |
| Roach Pittis Solicitors | Criminal Department, 2 agents, 2 memberships | 17 jobs linked to department/requesters; 23 dependencies | `oNBTvzK4dnM9GAm7fsmd` |
| Reigate & Banstead Borough Council | Fraud And Financial Team, 2 agents, 2 memberships | 3 jobs linked to requesters; 4 dependencies | `qXtENce7Rqe4n1xfAgXp` |
| St Michaels Hospice | 2 agents, 2 memberships | 1 requester-linked job; 2 dependencies | `1EdwigEeHb5UmuOFnH3T` |
| University of Portsmouth | Named requester plus shared payment mailbox | 1 requester-linked job; 2 dependencies | `DL1Yuq46rFcrXraIsdmt` |
| Priory Hospital Southampton | Marchwood department, 2 people, 1 shared mailbox | 2 requester-linked jobs; 2 dependencies | `Ul3cb0ORmIOVwyy4U8a0` |
| Priory Hospital Southampton, ward family | Sandpiper Ward and Starling Ward, 8 identities including 2 shared mailboxes, 8 memberships | 4 sources and 38 dependencies; 18 new department links; 2 existing requester links preserved | `a1i43bL2Egg6CeA90sl5` |

Priory exposed an important guardrail: the first preview created no department and treated `sandpipercrew@priorygroup.com` as a person. The merge was stopped, the inference engine was corrected and tested, and only the new preview with Marchwood plus a shared mailbox was executed.

The ward-family pass was also reconciled after execution. Active client rows changed from 600 to 596, the duplicate candidate disappeared, old source URLs resolve to the canonical profile, and the final account contains 20 jobs, 3 departments and 10 agents/mailboxes. Eighteen jobs are scoped to Sandpiper or Starling; the remaining two organisation-wide jobs retain their existing requester link to Katy Caswell. Preview labels distinguish deterministic coverage from links newly written during execution.

Crown Prosecution Service remains deliberately unmerged. Its five addresses are functional mailboxes rather than named agents, so the candidate is retained for manual classification instead of forcing requester links.

## Client CRM controls delivered

- Canonical profiles load jobs, invoices, departments, agents, and memberships even when entered through an old redirected client URL.
- The organisation header no longer presents a primary contact as the client identity.
- A dedicated `Departments & agents` workspace shows unassigned hierarchy gaps, unit membership, requester activity, access level, operational roles, and shared mailbox classification.
- Staff can create/edit departments and agent memberships, assign department scope, and distinguish named people from shared mailboxes.
- Backend validation blocks duplicate active department names, duplicate agent emails, cross-client department scope, and writes against merged source clients.
- Desktop, mobile and dark-mode browser checks cover the canonical Priory profile; mobile has no global horizontal overflow.

## Portal hierarchy bridge delivered

- `getMyClientPortalContext` resolves the canonical client, named agent, active membership and permitted departments on the server; clients cannot nominate another organisation or expand their own scope.
- `submitClientBookingRequest` now resolves membership scope before allocating a job number; `createAdminBooking` remains an admin-only gateway. The duplicate unused client booking component was removed so the routed form and backend contract cannot drift again.
- Authenticated bookings persist `clientDepartmentId`, `requestedByAgentId`, `requestedByUserId`, relationship sources and immutable organisation/department/requester snapshots.
- Staff can prepare a passive client account from a named agent. The operation links the user, agent and membership, preserves legacy `profileId` compatibility, creates an `IMPORTED` account and sends no communication.
- Shared mailboxes cannot receive portal accounts. Finance-only memberships cannot request jobs; client masters and legacy accounts retain controlled migration compatibility.
- Client cancellation checks the requester, department-manager or client-master scope instead of granting every agent authority over every job under the organisation.
- Client booking and invoice pages now read through server callables. Agents see their own jobs, department managers see assigned departments, client masters see the organisation, and finance-only users receive published invoices without booking/request controls.
- Portal navigation and dashboard actions use the same resolved permission context as the backend; restricted URLs redirect safely instead of displaying controls that later fail.
- Booking-linked support chat now enforces the same membership scope. Legacy guest-history linking moved from an ineffective direct Firestore write to an authenticated, non-hijacking, audited callable.
- Account activation now updates `clientAgents.userId` and `clientMemberships.userId` when a provisional user document is aligned to the real Firebase Auth UID.
- Prepared and active portal states are distinct in Client CRM. Chat is available only for active accounts, not passive imported identities.
- The first passive pilot linked Katy Caswell to Priory Hospital Southampton. Browser verification shows `CLIENT / IMPORTED` in Users & Roles and `Portal prepared` in Client CRM, with no activation email sent.
