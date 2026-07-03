# Starling Bank Integration Plan

Bookmark: STARLING_BANK_INTEGRATION_PLAN

Purpose: connect Lingland to Starling Bank in a controlled, auditable way. The first goal is bank reconciliation and finance visibility. Payment initiation must only come after the platform has proven reconciliation, approval controls and audit logging.

Primary references:

- Starling API docs: https://developer.starlingbank.com/docs
- Open Banking docs: https://developer.starlingbank.com/docs/open-banking
- AISP docs: https://developer.starlingbank.com/docs/aisp
- Starling API samples: https://github.com/starlingbank/api-samples

## 1. Recommended Direction

Start with `READ_ONLY` banking.

Do first:

- Import Starling bank transactions.
- Match incoming payments to `clientInvoices`.
- Match outgoing payments to `interpreterInvoices`.
- Show bank sync status in Finance CRM.
- Create finance exceptions for unmatched or suspicious payments.

Do not do first:

- Automatic interpreter payouts.
- Automatic invoice paid status without review.
- Any live outbound payment without double approval.

## 2. Banking Modes

Add a platform-level banking mode:

- `OFF`: no Starling calls.
- `READ_ONLY`: import accounts, balances and transactions only.
- `RECONCILIATION`: allow staff to match bank transactions to invoices.
- `PAYMENTS_SANDBOX`: allow outbound payment preparation in Starling sandbox.
- `PAYMENTS_LIVE`: allow live outbound payment requests with strict approval controls.

Recommended go-live order:

1. `OFF`
2. `READ_ONLY`
3. `RECONCILIATION`
4. `PAYMENTS_SANDBOX`
5. `PAYMENTS_LIVE`

## 3. Data Model

Create Firestore collections:

- `bankConnections`
- `bankAccounts`
- `bankTransactions`
- `bankReconciliationMatches`
- `bankSyncRuns`
- `bankPaymentRequests`
- `bankWebhooks`

### bankConnections

Fields:

- `provider`: `STARLING`
- `environment`: `SANDBOX | LIVE`
- `status`: `ACTIVE | REVOKED | ERROR`
- `scopes`
- `accountHolderUid`
- `createdBy`
- `createdAt`
- `updatedAt`
- `lastSyncAt`

Sensitive OAuth tokens must not be readable by the frontend. Store secrets in backend-only storage or Secret Manager.

### bankAccounts

Fields:

- `provider`
- `connectionId`
- `accountUid`
- `accountName`
- `currency`
- `accountType`
- `status`
- `balance`
- `availableBalance`
- `lastSyncedAt`

### bankTransactions

Fields:

- `provider`: `STARLING`
- `connectionId`
- `accountUid`
- `transactionId`
- `direction`: `IN | OUT`
- `amount`
- `currency`
- `counterpartyName`
- `reference`
- `transactionDate`
- `status`
- `rawPayload`
- `matchStatus`: `UNMATCHED | SUGGESTED | MATCHED | IGNORED | EXCEPTION`
- `matchedEntityType`: `clientInvoice | interpreterInvoice | paymentRequest`
- `matchedEntityId`
- `reconciliationScore`
- `createdAt`
- `updatedAt`

### bankReconciliationMatches

Fields:

- `bankTransactionId`
- `targetType`: `clientInvoice | interpreterInvoice`
- `targetId`
- `score`
- `matchedBy`: `SYSTEM | STAFF`
- `reviewedBy`
- `status`: `SUGGESTED | ACCEPTED | REJECTED`
- `reason`
- `createdAt`
- `reviewedAt`

### bankPaymentRequests

Fields:

- `provider`: `STARLING`
- `environment`
- `interpreterInvoiceId`
- `interpreterId`
- `recipientName`
- `recipientAccountLast4`
- `amount`
- `currency`
- `reference`
- `status`: `DRAFT | READY_FOR_APPROVAL | APPROVED | SENT_TO_BANK | PAID | FAILED | RETURNED | CANCELLED`
- `preparedBy`
- `approvedBy`
- `sentBy`
- `starlingPaymentId`
- `failureReason`
- `createdAt`
- `approvedAt`
- `sentAt`
- `updatedAt`

## 4. Backend Architecture

Create:

- `functions/src/banking/starlingClient.ts`
- `functions/src/banking/syncStarlingTransactions.ts`
- `functions/src/banking/onStarlingWebhook.ts`
- `functions/src/banking/reconcileBankTransaction.ts`
- `functions/src/banking/createStarlingPaymentRequest.ts`
- `functions/src/banking/approveStarlingPaymentRequest.ts`

Frontend service:

- `src/services/bankingService.ts`

Admin UI:

- `/admin/billing/bank-reconciliation`
- Finance CRM lane for bank exceptions.
- Client invoice detail bank match panel.
- Interpreter invoice detail payout panel.

## 5. OAuth And Secrets

Use OAuth for account-data access. Keep token exchange and refresh fully server-side.

Required backend-only secrets:

- Starling client id.
- Starling client secret.
- Starling webhook secret.
- Payment Services signing keys if outbound payments are implemented.

Rules:

- Never expose tokens in React.
- Never store raw secrets in Firestore readable by admins.
- Record OAuth connection status, not token values, in the UI.
- Support revoke/reconnect flow.

## 6. Transaction Sync

Function: `syncStarlingTransactions`

Inputs:

- `connectionId`
- `fromDate`
- `toDate`
- `dryRun`

Behavior:

- Fetch transactions from Starling since the last checkpoint.
- Upsert by Starling transaction id.
- Preserve raw payload for audit.
- Create `bankSyncRuns`.
- Do not modify invoices directly.

Acceptance:

- Running sync twice does not duplicate transactions.
- Failed sync writes a run record with error detail.
- Imported transactions are visible in Finance CRM.

## 7. Matching Logic

Match incoming payments to client invoices by:

- Exact invoice number in bank reference.
- Client name / counterparty name.
- Exact amount.
- Nearby invoice due date.
- Sage ref / PO / cost code.

Match outgoing payments to interpreter invoices by:

- Interpreter invoice reference.
- Interpreter name.
- Exact amount.
- Approved payable status.
- Bank account allowlist.

Score bands:

- `95+`: strong suggestion.
- `70-94`: review required.
- `<70`: unmatched.

Important: even a high score should initially create a suggestion, not automatically mark invoices as paid.

## 8. Finance UI

Create `Bank Reconciliation` inside Finance CRM.

Views:

- `Incoming payments`
- `Outgoing payments`
- `Suggested matches`
- `Unmatched`
- `Exceptions`
- `Ignored/internal transfers`

Actions:

- `Match to client invoice`
- `Match to interpreter invoice`
- `Mark client invoice paid`
- `Mark interpreter invoice paid`
- `Split payment`
- `Ignore/internal transfer`
- `Create finance exception`

UI requirements:

- Dense table-first layout.
- No card-heavy dashboard as primary workflow.
- Filters for date, direction, amount, status, client/interpreter, match score.
- Every action must show audit context before confirmation.

## 9. Webhooks

Function: `onStarlingWebhook`

Responsibilities:

- Validate webhook signature/secret.
- Store raw webhook in `bankWebhooks`.
- Upsert affected `bankTransactions`.
- Trigger reconciliation suggestions.
- Never send payment or mark invoice paid directly from webhook alone.

Webhook events to handle first:

- Inbound payment received.
- Outbound payment update.
- Payment rejected/failed.
- Payment returned/reversed.

## 10. Outbound Payments

Only implement after reconciliation is stable.

Flow:

1. Interpreter invoice is approved.
2. Staff creates payment draft.
3. System validates recipient bank details and amount.
4. First admin marks `READY_FOR_APPROVAL`.
5. Second admin approves.
6. Backend sends payment request to Starling.
7. Webhook confirms outcome.
8. Interpreter invoice becomes `PAID` only after bank confirmation.

Controls:

- Double approval.
- Per-payment amount limit.
- Daily payout limit.
- Recipient allowlist.
- Immutable audit event.
- Sandbox validation before live.

## 11. Security And Compliance

Non-negotiable rules:

- No live payment without explicit approval.
- No frontend access to Starling tokens.
- No automatic payout during Mirror Mode.
- Validate webhooks.
- Use idempotency keys.
- Store raw provider payloads for audit.
- Preserve full audit trail for every invoice status changed by banking.
- Support emergency switch: `bankingMode = OFF`.

## 12. Implementation Phases

### Phase 1 - Discovery And Configuration

- [ ] Confirm which Starling product Lingland will use: Public API/Open Banking vs Payment Services.
- [ ] Create sandbox account/app.
- [ ] Define scopes.
- [ ] Add `bankingMode` to system config.
- [ ] Add Starling settings card in Admin Settings.

### Phase 2 - Read-Only Connection

- [ ] Implement OAuth connection backend.
- [ ] Store connection metadata.
- [ ] Fetch account list.
- [ ] Fetch balance.
- [ ] Show connection status in Finance CRM.

### Phase 3 - Transaction Sync

- [ ] Implement transaction import.
- [ ] Create `bankTransactions`.
- [ ] Create `bankSyncRuns`.
- [ ] Add idempotent upsert.
- [ ] Add manual sync button.

### Phase 4 - Reconciliation

- [ ] Build matching engine.
- [ ] Suggest client invoice matches.
- [ ] Suggest interpreter invoice matches.
- [ ] Add review UI.
- [ ] Add accept/reject actions.
- [ ] Write audit events.

### Phase 5 - Webhooks

- [ ] Configure webhook endpoint.
- [ ] Validate signature.
- [ ] Store raw webhook.
- [ ] Update bank transactions.
- [ ] Trigger matching suggestions.

### Phase 6 - Payment Sandbox

- [ ] Add payment request data model.
- [ ] Add interpreter invoice payout panel.
- [ ] Implement approval workflow.
- [ ] Send sandbox payment.
- [ ] Handle success/failure webhook.

### Phase 7 - Live Payments

- [ ] Add live feature flag.
- [ ] Add double approval enforcement.
- [ ] Add recipient allowlist.
- [ ] Add daily/payment limits.
- [ ] Run limited pilot.
- [ ] Enable live only after audit sign-off.

## 13. Acceptance Criteria

Read-only banking is complete when:

- [ ] Starling account connects successfully.
- [ ] Transactions import without duplicates.
- [ ] Finance can see transactions in the UI.
- [ ] Sync runs and errors are auditable.

Reconciliation is complete when:

- [ ] Client invoices can be matched to inbound payments.
- [ ] Interpreter invoices can be matched to outbound payments.
- [ ] Staff can accept/reject matches.
- [ ] Invoice paid status changes create audit events.

Payments are complete only when:

- [ ] Sandbox payment flow works end to end.
- [ ] Double approval is enforced.
- [ ] Webhook confirmation updates payout status.
- [ ] Emergency OFF switch is verified.
- [ ] Live pilot is approved.

## 14. Recommended First Build

Build only this first:

1. `bankingMode`.
2. Starling connection metadata.
3. Read-only transaction sync.
4. Bank Reconciliation page.
5. Suggested matching to `clientInvoices`.

Leave outbound payments for a later milestone.
