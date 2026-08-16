# Xero Current-FY Reconciliation Evidence

Date: 2026-08-13
Organisation: Lingland
Scope: 2026-04-01 through 2026-08-07
Mode: Xero read-only; platform communications suppressed

## Controlled source

- Package: `Sage_Lingland_Xero_Current_FY_2026-04-01_to_2026-08-07.json`
- Manifest hash: `bd86e70dc3ec85047b1b9334c108f8a67100109c13beb19b2ac43292c7083fc2`
- Extraction checks: 27 passed, 0 failed
- Receivables control: 477 sales invoices
- Payables control: 269 purchase bills
- Sales gross: GBP 110,579.81
- Purchase gross: GBP 55,594.99
- Known Sage supplier alias `VANYA` was consolidated into the canonical Xero account number `VAN002`; source reference remains preserved as evidence.

## Canonical imports

- Master-data run: `sage_d22f256689bfdd24106645ef`
- Master records: 256 across 6 controlled batches
- Finance run: `sage_0199004e025ee1f885db711b`
- Finance records: 1,367 across 25 controlled batches
- Communications: `SUPPRESSED`
- Existing operational invoices overwritten: no

## First controlled preview and apply

- Preview run: `T8sYNO4RN8iyntwiezUQ`
- Canonical finance batch: `sage_0199004e025ee1f885db711b`
- Contacts: 119 exact / 119 referenced
- Receivables: 477 exact / 477
- Payables: 269 exact / 269
- Exceptions requiring review: 0
- Xero statuses observed: 745 DRAFT, 1 PAID
- Exact local links applied: 865
- Already linked: 0
- Link conflicts: 0
- Xero records changed: no
- Job, settlement or payment status changed: no

## Repeat proof

- Repeat preview run: `bWXw14cbOrjZiFYVRWbS`
- Contacts: 119 / 119 exact
- Receivables: 477 / 477 exact
- Payables: 269 / 269 exact
- Exceptions requiring review: 0
- Unexplained drift: 0

## Safety conclusion

The controlled current-financial-year accounting archive is deterministically linked to Xero. The platform remains the operational source of truth, Xero remains read-only from Lingland, and accounting evidence does not mutate job workflow.
