# AgriCoopLedger: build list

Working document. Check it against the SRS before treating it as final.

Status key: **Done**, **Next**, **Later**, **Optional**.

## 1. Assumptions and open questions

Assumptions (change any that are wrong):

- Farmers do not log in. Staff record everything on their behalf.
- Payments are recorded manually (cash or mobile money). There is no payment gateway.
- The app is online only. Offline support is out of scope for now.
- English only for now.
- One staff member belongs to one cooperative.
- Two roles: Manager and Clerk. The person who registers a cooperative is its Manager. The Manager adds Clerks.

Open questions:

1. **Pricing.** Recommended: the Manager sets a price per kg for each produce type. Each delivery stores the price used at the time, so later price changes never alter old records.
2. **Corrections.** Recommended: deliveries and payments are never edited or deleted. A mistake is fixed by a reversal entry with a reason, made by the Manager.
3. **Farmers.** Assumed: farmers never log in. Staff record everything on their behalf.

Resolved: two roles (Manager and Clerk). Registration creates the cooperative and its Manager. Clerks are added from the Staff page.

## 2. Roles

| Capability | Manager | Clerk |
|---|---|---|
| Record deliveries and payments | yes | yes |
| Add and edit farmers | yes | yes |
| View farmer balances and statements | yes | yes |
| Reverse a delivery or payment | yes | no |
| Set produce and prices | yes | no |
| Reports and exports | yes | no |
| Manage staff and reset passwords | yes | no |

Reversals stay with the Manager so there is one control point for corrections. The role is a field on the user, so a third role can be added later.

## 3. Pages

| # | Page | Who | Status |
|---|---|---|---|
| 1 | Sign in | all | Done |
| 2 | Register your cooperative | new manager | Done |
| 3 | App shell: sidebar (drawer on phones), role-based menu, sign out | all | Done |
| 4 | Dashboard: totals, weekly chart, largest balances, recent activity, quick actions | all | Done (sample data) |
| 5 | Farmers list: search, add | manager, clerk | Done (sample data) |
| 6 | Farmer detail: profile, deliveries, payments, current balance | manager, clerk | Done (sample data) |
| 7 | Add and edit farmer | manager, clerk | Done (sample data), includes deactivate |
| 8 | Record delivery (phone-first): farmer, produce, kg, date, price shown | manager, clerk | Done (sample data) |
| 9 | Deliveries list: filter by date, produce, farmer | manager, clerk | Done (sample data) |
| 10 | Record payment: farmer, balance shown, amount, method, date | manager, clerk | Done (sample data) |
| 11 | Payments list: filter (reverse is manager only) | manager, clerk | Done (sample data), reversal included |
| 12 | Produce and prices | manager | Done (sample data), with price history |
| 13 | Reports: period summary, farmer statement (print and CSV) | manager | Done (sample data), print and CSV |
| 14 | Staff: list, add clerks, change role, deactivate, reset password | manager | Done (sample data, accounts exist only in the browser) |
| 15 | Cooperative settings | manager | Done (sample data) |
| 16 | My account: change password | all | Form done, server not connected |
| 17 | Not found and access denied | all | Done |

## 4. Functionality

**Accounts and access**
- Register a cooperative and its first Manager (done)
- Manager adds Clerks
- Sign in and out with phone number and password (done)
- Server-side role checks on every request
- Manager resets a staff member's password
- Manager deactivates a staff member

**Farmers**
- Add, edit and search farmers (name, phone, village, member number)
- Deactivate a farmer, never delete one with records

**Deliveries**
- Record a delivery: farmer, produce type, weight in kg, date
- Amount calculated from the price in force and stored with the delivery
- Reverse a delivery with a reason
- List and filter deliveries

**Payments**
- Record a payment: farmer, amount, method (cash or mobile money), reference, date
- Block or warn when a payment exceeds the balance owed
- Reverse a payment with a reason
- List and filter payments

**Balances and reports**
- Balance per farmer = total delivered value minus total paid
- Dashboard totals for today and the current period
- Farmer statement: all deliveries and payments with a running balance
- Period summary by produce and by farmer
- Export CSV and print a statement

**Audit**
- Log who recorded or reversed what, and when
- Show "recorded by" on every delivery and payment

## 5. Data entities (feeds the class diagram)

Cooperative, User (role: manager or clerk, active), Farmer, ProduceType, Price (produce, amount per kg, effective from), Delivery (farmer, produce, kg, price used, amount, recorded by, date, reversed), Payment (farmer, amount, method, reference, recorded by, date, reversed), AuditLog.

## 6. API groups

`/auth` (register, login, logout, me), `/users`, `/farmers`, `/produce`, `/deliveries`, `/payments`, `/reports`, `/health`.

## 7. Non-functional requirements

- **Integrity:** money in whole RWF integers. Records are never edited or deleted, only reversed.
- **Security:** argon2 password hashes, session cookies (HttpOnly, SameSite), role checks on the server, data scoped to the user's cooperative.
- **Usability:** the record-delivery page works well on a small phone. Contrast meets WCAG AA. Errors say what to fix.
- **Performance:** pages stay light for weak connections. List pages are paginated.
- **Reliability:** database backups and a CSV export of all data.
- **Testability:** pytest on balance calculation, reversals and role checks.

## 8. Trade-offs and what to revisit

| Decision | Chosen | Cost | Revisit when |
|---|---|---|---|
| No offline mode | online only | clerks in poor coverage cannot record | field testing shows connection is a real blocker |
| Reversals instead of edits | auditable history | more steps to fix a typo | users complain about correction effort |
| Manual payment records | no gateway complexity | no automatic mobile money matching | a cooperative wants it |
| Single cooperative per user | simple data model | one person cannot serve two cooperatives | a real user needs it |
| Session cookies | simpler and safer | harder to reuse for a mobile app | a native app is planned |

## 9. Suggested build order

1. Database models and migrations
2. Auth: register, login, logout, role checks (connects the finished pages)
3. App shell and dashboard layout
4. Farmers (list, add, edit, detail)
5. Produce and prices
6. Record delivery and deliveries list
7. Record payment, balances and payments list
8. Reversals and audit log
9. Reports and exports
10. Staff management and account settings
11. Tests, polish, demo data, final documentation
