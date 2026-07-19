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

- [ ] Add persistent review decisions: reject, split, and defer. Merge confirmation is implemented.
- [x] Create canonical client, department, agent, and membership manifests with backups and rollback ownership markers.
- [x] Preview every protected client field winner and conflict before a write.
- [x] Produce dependency rewrite counts, concurrency fingerprint, backups, and tested rollback payload.
- [ ] Require a second administrator approval for high-risk groups.

### Phase 3 - Non-destructive migration

- [x] Create canonical hierarchy records before redirecting source clients.
- [x] Reassign client relationships in jobs, client invoices, timesheets, and interpreter invoice lines without rewriting historical display snapshots.
- [x] Add department and requester relationship fields to bookings and populate them when evidence is deterministic.
- [x] Extend department, agent, and membership relationships to invoices, chats, notifications, and users. New invoice paths and lifecycle notifications now persist hierarchy scope; historical finance repair remains an explicit reviewed backfill.
- [x] Dual-read the legacy client contact and the new hierarchy in the admin Client CRM while backfilling.
- [x] Write a merge manifest, source snapshots, dependency ledger, and audit event for every executed consolidation.
- [ ] Reconcile counts and financial totals before enabling new access rules. The read-only integrity audit and fingerprinted finance backfill are implemented; the production dry run and reviewed application remain.

### Phase 4 - Accounts and permissions

- [ ] Replace `users.profileId` client access with membership-based scope. Portal reads/actions now use membership scope; `profileId` remains only as cutover compatibility until Firestore rules are tightened.
- [ ] Update Firestore rules for agent, department manager, finance, and client master access.
- [ ] Add invitation and activation flows that attach a user to an existing agent safely. Passive preparation, membership linking and provisional-ID to Auth-UID repair are complete; activation email/go-live validation remains.
- [ ] Add master-agent administration for departments and subordinate agents.
- [ ] Verify least-privilege access with emulator tests.

### Phase 5 - Booking and staff workflows

- [ ] Update public and authenticated booking forms: Client -> Department -> Agent. The authenticated portal now resolves the signed-in membership and records canonical client, department, agent, user and immutable snapshots; public intake remains.
- [ ] Allow authorised users to request a new client or department without creating duplicates automatically.
- [ ] Give staff full manual control to select, create, or repair hierarchy links. Department and agent membership management is complete in Client CRM; booking and invoice repair controls remain.
- [x] Update Airtable sync to resolve organisations deterministically and report unresolved client/invoice identities without creating finance-owned client records.
- [ ] Preserve the manual/hybrid operating model when an agent has no active account.

### Phase 6 - Cutover and cleanup

- [ ] Run parallel reconciliation against Airtable and current production records.
- [ ] Confirm job, invoice, and account totals at every hierarchy level.
- [ ] Enable membership-based reads, then stop creating legacy contact-shaped clients.
- [ ] Keep aliases and migration ledger permanently for auditability.
- [ ] Archive superseded records only after the rollback window closes.

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

## Current implementation boundary

Audit refresh remains deliberately **read-only**. Organisation consolidation is available only through a live preview and is non-destructive: the canonical client remains active, source records become redirects, relationship IDs are reassigned, and a rollback manifest is written first. Conflicting Sage identities and source records linked to portal users are blocked.

The executable merge now creates and backs up departments, agents, shared mailboxes, and memberships before redirecting a source client. Historical jobs receive department/requester IDs only when deterministic evidence exists. Admins can create or edit departments and agent memberships from the canonical client profile through validated Cloud Functions; every manual hierarchy write creates an `auditEvents` entry. Institution-family matching can now join a named ward/site to its parent only when organisation-name evidence is corroborated by both the same normalised phone and the same specific email domain.

Membership-scoped portal reads, authenticated booking selection, cancellation and booking-linked support chat are now executable. Client invoice access uses department/requester scope whenever projected links exist; historical client-only invoices retain a controlled compatibility path until the reviewed backfill is applied. Direct Firestore client reads remain temporarily available for the currently deployed legacy frontend and must be removed in the same release that publishes the new callable-based portal.

New client invoices generated by staff, scheduled finance, AI, or Airtable now use one tested hierarchy projector. Invoice headers carry all linked job, department, requester-agent, and requester-user IDs plus a coverage state; each invoice line carries the exact scope of its source job. Timesheet submission also snapshots the booking hierarchy so later finance processing does not need to infer identity from display text.

The Client Identity Audit now has a separate hierarchy-integrity gate. It checks missing and redirected client links, cross-client departments, requester memberships, user mismatches, orphan invoice lines, notification recipients, and the exact number of invoice/header lines requiring repair. `reconcileClientFinanceHierarchy` is read-only by default; writes require Super Admin, the reviewed fingerprint, and the phrase `RECONCILE CLIENT FINANCE`. Any invoice connected to jobs from different clients blocks the whole application. Before writing, the system stores every touched field in a reconciliation manifest; rollback restores only documents still owned by that manifest.

Client lifecycle notifications now resolve recipients from active memberships. Request updates go to the requester, in-scope department managers, and client masters; invoice events go to in-scope finance memberships and client masters. Passive imported accounts are excluded, and push delivery continues to obey Platform Mode communication policy.

REDBOOK synchronisation now follows the same identity boundary as the CRM. Client organisations are resolved by source record, stable Airtable client key, Sage reference, or a unique exact normalised organisation name. Booking and finance email addresses no longer select or generate an organisation ID; they remain evidence for agent or shared-mailbox classification. Ambiguous invoice ownership is written as an explicit sync conflict and must be linked to a canonical client before financial reconciliation.

The legacy Airtable form webhook is now compatibility-only. It authenticates and records a hash-only receipt, then defers processing to REDBOOK sync; it cannot create a duplicate client/job, allocate an `LL-xxxx` number, or queue an email. Public booking intake applies the hierarchy at entry: exact organisation identity or a provisional organisation, separate requester and finance identities, inactive memberships pending staff verification, and immutable booking snapshots. Ambiguous organisation or agent identities remain visibly unresolved instead of being guessed from email.

An agent email becomes immutable in Client CRM once the agent or membership is linked to a portal user. The UI directs staff to user administration and the callable enforces the same rule, preventing Firebase Auth, `users`, `clientAgents`, and `clientMemberships` from diverging.

Production audit snapshot on 19 July 2026: 596 active client records, 138 organisation candidates, 30 repeated-agent candidates, 182 invoice headers and 201 invoice lines eligible for reviewed hierarchy backfill, 50 identity repairs, 87 blocked invoices, 508 critical links, and 66 warnings. No bulk finance reconciliation was applied during this validation cycle.

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
