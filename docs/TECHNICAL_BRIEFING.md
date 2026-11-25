# AgriCoopLedger technical briefing

How the system is put together, how a request moves through it, and why each choice was made. Written so you can explain and defend any part of it. Where something was not verified it says so.

## 1. What it is, in one paragraph

A web application that replaces a cooperative's paper books. A Collection Clerk records each produce delivery, the system prices it, and the farmer's balance goes up. A Payment Officer records each payment, and the balance goes down. A Manager sets prices and staff, corrects mistakes with a reason, and reads reports and the audit log. Nothing is ever deleted. Every change is logged in the same database transaction as the change itself.

## 2. Architecture

```
Browser (React app)
   |  HTTPS in the hosted demo, HTTP locally. One origin: /api goes to the backend.
   v
Render (hosted demo, HTTPS), Caddy (own server) or Vite dev server proxy (local)
   |  /api/*
   v
FastAPI backend (Python)
   |  routers -> services (money rules) -> SQLAlchemy ORM
   v
PostgreSQL   (SQLite for tests and quick local runs)
   ^
   |  pg_dump once a day
Backup container -> ./backups (14 days kept)
```

Why these choices:

- **FastAPI:** typed request validation (Pydantic) gives accurate error messages for free, and dependency injection makes the role check a one line guard on each route.
- **SQLAlchemy 2.0:** one set of models runs on PostgreSQL and SQLite, so the same code is tested in memory and run in production.
- **PostgreSQL:** real transactions and row locks, which the audit chain relies on.
- **React with plain JavaScript and Vite:** small, fast build. No TypeScript to keep the course scope manageable.
- **Session cookies, not tokens in local storage:** the cookie is HttpOnly (JavaScript cannot read it), so a script injected into the page cannot steal it. `SameSite=Lax` blocks cross-site form posts.
- **One origin:** the dev proxy and Caddy both put the front end and `/api` on the same address, so no CORS configuration is needed and cookies just work.

### Repository map

| Path | Contents |
|---|---|
| `backend/app/models.py` | Every table |
| `backend/app/schemas.py` | Request and response shapes, input validation |
| `backend/app/services.py` | Money and balance rules, price lookup, Kigali date |
| `backend/app/audit.py` | Audit entry writer and hash chain verifier |
| `backend/app/deps.py` | `get_current_user` (session, idle timeout) and `require_role` |
| `backend/app/routers/` | One file per area: auth, users, cooperative, farmers, produce, deliveries, corrections, payments, disputes, buyers, audit, reports, public |
| `backend/app/seed.py` | Synthetic demo cooperative |
| `backend/tests/` | 204 pytest tests |
| `frontend/src/api.js` | The only place that calls `fetch` |
| `frontend/src/context/` | `AuthContext` (who is signed in) and `LedgerContext` (shared data) |
| `frontend/src/pages/` | One file per screen |
| `frontend/src/lib/` | Formatting, validation, small hooks, `theme.js` (light and dark) |
| `frontend/src/styles/` | `theme.css` and `app.css` (base), `dark.css` (dark tokens), `landing.css`, `polish.css`, `print.css` (paper layouts) |
| `frontend/src/components/TitleManager.jsx` | Sets the browser tab title on every route |
| `frontend/public/` | Tab icon (favicon, Apple touch icon, 192 and 512 app icons) and `site.webmanifest` |
| `scripts/e2e_smoke.py` | The Playwright browser smoke test (60 checks) |
| `scripts/e2e_new.py` | Playwright checks for enrolment approval, payment batches and the offline queue (13 checks) |
| `Dockerfile.render`, `render.yaml`, `backend/start.sh` | Hosted demo on Render: one web service serves the API and the built front end, with a Render PostgreSQL database |
| `backend/backup_to_b2.py`, `Dockerfile.backup` | Backblaze B2 backup job (written, not yet scheduled) |
| `frontend/src/lib/offlineQueue.js`, `context/OfflineContext.jsx` | The Clerk's offline delivery queue |
| `docker-compose.yml` | db, backend, frontend, backup |
| `docker-compose.https.yml`, `frontend/Caddyfile` | Hosted demo with HTTPS |

## 3. The data model

| Table | Holds | Notes |
|---|---|---|
| `cooperatives` | name, district, phone | Every other row belongs to one |
| `users` | name, username, phone, password hash, role, active flag, approval (approved, pending, rejected) | Username and phone are each unique. A pending or rejected user is inactive |
| `farmers` | name, 16 digit national ID, phone, village, member since, active flag, enrolment (approved, pending, rejected), proposed by, decided by, decision note | ID unique per cooperative. A pending or rejected farmer is inactive |
| `produce_types` | name, active flag | |
| `prices` | produce, grade, price per kg, effective from, set by | A new row per change, never an update. This is the price history (FR 3.2) |
| `deliveries` | farmer, produce, grade, weight in grams, price per kg, value, date, recorded by, void fields, client id | The price is copied onto the row (BR 3) |
| `corrections` | delivery, old and new weight and grade, reason, status, requester, decider | Status: pending, approved, rejected, direct |
| `payments` | farmer, amount, method, reference, date, recorded by, void fields, client id, batch (optional) | |
| `selling_prices` | produce, grade, price per kg, effective from, set by | Manager only. Rows are only added |
| `disputes` | delivery or payment, reason, status (open, upheld, dismissed), decision note | One open dispute per record |
| `buyer_orders`, `sales`, `buyer_payments` | Public order requests, sales from stock at the selling price, buyer payments (pending, confirmed, rejected) | Stock is worked out, never stored |
| `payment_batches` | cooperative, made by, note, status (submitted, approved, rejected), decided by, decision note | Part paid and paid are not stored. They are worked out from the payments inside the batch |
| `batch_lines` | batch, farmer, planned amount | One line per farmer per batch |
| `audit_log` | who (name copied), action, entity, summary, time, previous hash, own hash | Append only |

Design rules that run through all of it:

1. **Cooperative scoping.** Every query filters by the signed-in user's `cooperative_id`. A record from another cooperative returns 404, not 403, so its existence is not revealed. There is a test that signs in as a second cooperative and tries every route.
2. **Never delete.** There is no delete route for deliveries, payments, farmers or audit entries. A void sets `voided_at`, `voided_by` and `void_reason`. A correction keeps the old values on its own row. A test confirms the audit routes reject delete, put and patch.
3. **Balances are never stored.** Balance owed is computed: live deliveries minus live payments. A stored balance can drift out of step with the records, a computed one cannot.

## 4. Money and weight

- Weight is stored as **whole grams** (an integer). 12.345 kg is 12,345 g. The API accepts up to three decimals and rejects more.
- Prices and amounts are **whole RWF integers**. There are no floating point numbers anywhere in money.
- Value = `(grams * price_per_kg + 500) // 1000`. That is integer division with +500 first, which rounds half up to the nearest franc. Worked check: 12.345 kg at 700 RWF is 12,345 x 700 = 8,641,500, plus 500 = 8,642,000, divided by 1000 = **8,642 RWF**. The tests assert this by hand-calculated values.
- A float would give 8641.5 and some languages round that to 8641 or 8642 depending on representation. Integers remove the question.
- The price is copied onto each delivery at the moment it is recorded (BR 3). A later price change adds a new `prices` row and cannot touch old deliveries.
- Which price applies: the newest row for that produce and grade whose `effective_from` is on or before the delivery date. Deliveries can therefore be recorded with an earlier date and still get the right price.
- "Today" is computed in Kigali time (a fixed UTC+2, since Rwanda has no daylight saving). A server running in UTC would otherwise call 1 am in Kigali "yesterday".
- Overpayment (BR 4, FR 5.3): a payment above the balance is refused with the amount owed in the message. Correcting or voiding a delivery is also refused if it would leave the farmer overpaid, so the balance can never go negative.

## 5. Authentication, sessions and roles

**Sign in.** The browser posts a username (or phone number) and password. The server finds the user (username first, then phone in any format, normalised to +250...), and checks the password with argon2. Argon2 is a deliberately slow, memory hard hash, so a stolen database cannot be cracked quickly. An unknown user still spends the same time hashing a dummy value, so response time does not reveal which usernames exist. The error message is the same for a wrong username and a wrong password.

**Session.** On success the server stores `user_id` and `last_seen` in a cookie signed with `SECRET_KEY` (Starlette `SessionMiddleware`, `itsdangerous`). The signature stops anyone editing the cookie. The cookie holds only these two values, not a password or a role.

**15 minute idle timeout (NFR 13).** Every request goes through `get_current_user`, which compares now with `last_seen`. More than 900 seconds returns 401 and clears the session. Otherwise `last_seen` is refreshed. The browser also runs its own idle timer so the screen signs out at the same moment. The server is the real control, because a client timer can be bypassed.

**Roles (NFR 11, BR 1, BR 2).** `require_role("clerk")` is a dependency on the route. The role is read from the database user on every request, not from the cookie, so deactivating a person or changing their role takes effect immediately. The front end hides buttons for convenience, but the server enforces everything: a test runs every route as every role and compares the status codes with a table.

| Action | Manager | Clerk | Payment Officer |
|---|---|---|---|
| Record delivery | no | yes | no |
| Record payment | no | no | yes |
| Correct or void | yes | request only | no |
| Set prices, staff, settings | yes | no | no |
| Read prices | yes | yes | yes |
| Reports | yes | no | yes |
| Audit log | yes | no | no |
| See full national ID | yes | yes | masked |

**Privacy (NFR 14).** The Payment Officer's API responses mask the ID (12 asterisks and the last 4 digits) on the server, and the farmer search ignores the ID for that role, otherwise someone could discover an ID digit by digit through search.

## 5a. Joining a cooperative

`POST /auth/register` looks for a cooperative whose name matches ignoring case and spacing. The sign up form asks what the person is signing up as (`account_type`: manager, clerk or payment_officer). A Manager registration needs a name nobody has used and creates the cooperative with the person as its approved Manager. A Manager registration with a name that exists is refused (409), with a message that says to choose Clerk or Payment Officer to join it. A Clerk or Payment Officer registration needs an existing cooperative (404 otherwise) and creates the person as pending and inactive, holding the role they asked for, and writes a `user.requested` audit entry. The role gives no access until a Manager approves, and the Manager may change it. If `account_type` is left out (an API caller), the name alone decides as before: new name makes a Manager, an existing name makes a pending Clerk. Login checks the password first, then returns 403 with a message for a pending or rejected person, so the message does not reveal that an account exists to someone who does not know the password. The Manager's `POST /users/{id}/approve` (body: role) activates the person and sets the role. `POST /users/{id}/reject` declines a pending request. Both write audit entries and are scoped to the Manager's cooperative (another cooperative's request returns 404).

## 5b. Farmer enrolment approval (FR 2.5)

A Clerk who registers a farmer creates a proposal: `enrolment = pending`, `is_active = false`, `proposed_by` set, audit entry `farmer.proposed`. A Manager who registers a farmer creates an approved, active farmer at once (`farmer.created`). Because a pending farmer is inactive, BR 6 already blocks deliveries and payments for them, so the delivery and payment routes needed no extra checks. `POST /farmers/{id}/approve` and `/reject` are Manager only, take an optional note, write `farmer.approved` or `farmer.rejected`, and refuse a farmer who is not pending (409). The person who proposed can never decide their own proposal (BR 10). Activate and deactivate refuse a farmer who is not approved.

## 5c. Payment batches (FR 10)

A Payment Officer makes a batch with `POST /batches`: a list of farmers and a planned amount for each. Each planned amount must be at most that farmer's balance, and a farmer cannot be in two open batches. The batch starts as `submitted`. A Manager approves it or declines it with a reason (`batch.approved`, `batch.rejected`), and never the person who made it. After approval, the Officer records payments with `POST /batches/{id}/payments`. This calls the same `record_payment_core` as a normal payment, so the one-time id, the cooperative lock, the overpayment check, the reference check and the audit entry are shared. Two extra checks apply: the batch must be approved, and the amount must not exceed what is still planned for that farmer. Each payment keeps `batch_id`. Part paid and paid are derived from the live payments with that batch id, so voiding a payment moves a line back by itself. A direct payment (`POST /payments`) is still allowed. Buyer money does not fund or limit farmer batches.

## 5d. Offline entry for the Clerk (FR 4.10)

When the network is down, the delivery form keeps the delivery in `localStorage` for that user, with its one-time id, and shows it in a "waiting to send" list. When the browser reports it is online again, the queue sends each delivery in order through the normal `POST /deliveries`. Because the one-time id is already part of that route (FR 4.8), a delivery that reached the server but whose answer was lost is not recorded twice. A delivery the server refuses stays in the list with its reason. Limits: there is no service worker, so reloading the page while offline fails (open the form while online first). The queue lives on that device and browser. The 15 minute idle sign-out still applies.

## 5f. Statuses, selling prices, disputes and the buyer side (FR 4.9, 5.8, 3.4, 11, 12)

**Statuses.** A delivery's `status` (recorded, correction_pending, disputed, voided) and `payment_status` (unpaid, in_batch, part_paid, paid) are computed when it is read, from corrections, disputes, batch lines and payments. Farmer payments are applied first in first out to live deliveries. Nothing is stored, so a void moves a status back by itself.

**Selling prices.** Table `SellingPrice` (produce, grade, price per kg, effective date, who set it). Only a Manager posts to `POST /api/produce/{id}/selling-prices`. The same price is a 409 and a start date before the latest is a 422. `current_selling_price(db, produce, grade, on)` returns the price in force on a date. A sale or accepted order uses it. If there is none the answer is 409 ("Ask the Manager to set it"), and a supplied price that differs is a 422. The Produce page suggests the buying price times 1.2, rounded up to 10 RWF, as a hint only.

**Disputes.** `disputes.py`. A Clerk disputes deliveries, a Payment Officer payments, a Manager either. One open dispute per record. `uphold` and `dismiss` are Manager only and need a note of at least 5 characters. Upholding changes no amount.

**Buyer side.** Public routes: `GET /api/public/stock` (kilograms per cooperative, produce and grade, no prices) and `POST /api/public/orders` (refused above stock, at most 3 open per phone and cooperative, audited as a person who is not signed in). Clerk routes accept or decline an order, record sales (`POST /sales`, voidable) and record buyer payments (`POST /sales/{id}/payments`, pending). A Payment Officer confirms or rejects. A Manager only reads (BR 11). Stock for a cooperative, produce and grade is live deliveries minus live sales, read under the cooperative lock. Buyer payments that are not rejected may not exceed the sale value, and a reference is unique among them.

## 5e. Input validation

Every request body inherits a base model that forbids unknown fields. Amounts, prices and ids are strict integers, so `true`, `"1000"` and `1e3` fail. Weight is read from a plain decimal pattern (up to 6 digits and 3 decimals, no sign, exponent or NaN). Dates must be `YYYY-MM-DD`. Names, places, references and one-time ids have fixed patterns and control characters are refused. Digits are ASCII only, so look-alike digits from other scripts fail. Search text is escaped so `%` and `_` match literally. The browser mirrors these checks, the server is the control.

## 6. Walk-through: recording a delivery, end to end

1. The Clerk opens Record delivery. The page creates a random `client_id` once and holds it.
2. They pick farmer, produce, grade and type the weight. The slip on screen shows a *preview* price and value computed in the browser from the prices already loaded. This is for the farmer to check. The server recalculates the real value.
3. Submit: `POST /api/deliveries` with the form values and the `client_id`.
4. FastAPI validates the body (weight is a positive decimal with at most 3 places, grade is A, B or C).
5. `require_role("clerk")` checks the session and role.
6. The handler checks, in order: has this `client_id` already been used (if so return that delivery, do nothing more); farmer and produce exist in this cooperative; farmer and produce are active (BR 6); date is not in the future; a price exists for that date.
7. It builds the row: grams, copied price, computed value. `flush()` gives it an id, so the receipt number `D-000123` can be written into the audit summary.
8. `audit.record(...)` adds the audit entry in the **same transaction**.
9. `commit()`. Either both the delivery and its audit entry are saved or neither is. If two identical submissions race, the database's unique constraint on `(cooperative_id, client_id)` rejects the second, the handler rolls back and returns the first. No duplicate is possible.
10. The response goes back, the page shows the receipt, and the shared ledger data reloads so balances and lists are current.

## 7. The correction flow (FR 4.4, BR 5)

- **Manager direct:** `POST /deliveries/{id}/correct` with a reason. A `corrections` row with status `direct` records the old and new weight, grade and value. The delivery row is updated. A weight only change keeps the price the delivery was recorded under. A grade change looks up that grade's price in force on the delivery date (not today's price) and is refused if none exists.
- **Clerk request:** `POST /corrections` creates a `pending` row and changes nothing else. A Manager approves (the same apply step runs and the row becomes `approved`) or rejects (with a note). The approver must not be the requester, and only one pending request can exist per delivery.
- The apply step is shared code, so both paths follow the same rules, including the overpayment check.

## 8. The tamper evident audit log (FR 7.1, NFR 15)

Each entry stores `prev_hash` (the hash of the entry before it in the same cooperative) and `entry_hash = SHA-256(prev_hash, cooperative, user, user name, action, entity, entity id, summary, timestamp)`.

- Editing the text of an old entry changes its hash, so it no longer matches the hash stored on it, and the next entry's `prev_hash` no longer matches either.
- Deleting an entry from the middle leaves the next entry pointing at a hash that is no longer there.
- `GET /api/audit/verify` walks the chain from the start and returns `ok`, how many entries were checked, and the first bad entry. The Audit log page has a Check integrity button.
- To stop two simultaneous requests chaining onto the same previous entry, the writer first locks the cooperative row (`SELECT ... FOR UPDATE` on PostgreSQL).
- The user's name is copied into each entry, so renaming a person later does not rewrite history.

**Honest limits.** It detects edits and removal in the middle. It cannot detect the newest entries being cut off, because nothing later points at them. Someone with full write access to the database could rewrite every row and recompute every hash. A stronger design would publish the latest hash somewhere outside the database (for example, print it on the daily report). This is "tamper evident", not "tamper proof", and the README says so.

## 9. Server side lists, reports and the dashboard

The first version loaded every delivery and payment into the browser and filtered there. Measured on a year of data (5,475 deliveries) that was a 1.8 MB response on every page load and after every save, which is a poor fit for the low bandwidth rural connections the SRS expects.

Now:

| Need | Endpoint | Size with a year of data |
|---|---|---|
| Deliveries list | `GET /deliveries?page&page_size&q&produce_id&grade&date_from&date_to&farmer_id` | about 8 KB a page |
| Payments list | `GET /payments?...` | similar |
| Farmer statement | `GET /farmers/{id}/statement?date_from&date_to` | about 3 KB |
| Period summary | `GET /reports/summary?...` | about 25 KB |
| Dashboard | `GET /dashboard` | about 3 KB |
| Produce mix ring on the dashboard | `GET /reports/produce-mix?period=` (week, month, last_month, quarter or last_quarter) | under 1 KB |
| Landing page totals (no sign in) | `GET /public/stats` | under 1 KB |

The list endpoints return `{items, total, page, page_size}` plus totals (count, kilograms, value) over *every page of the filter*, computed with SQL `SUM`, so the figure above the table is right even when the table shows 25 rows. Farmers are still loaded in full (a few hundred rows), and `last_delivery_date` comes with each farmer.

The shared `LedgerContext` now holds only farmers, produce and prices, staff and corrections. Each screen asks for what it needs through the `useApiData` hook, which asks again whenever a `version` counter changes after a saved change, and throws away answers that arrive out of order.

Measured on SQLite, in process, with a year of data: page of deliveries 13 to 36 ms, dashboard 22 ms, summary 17 ms, statement 10 ms, posting a delivery 16 ms. This is not a network or PostgreSQL measurement.

## 10. Duplicate protection (SRS Figure 3 description)

The SRS activity description says a retry must not create a duplicate delivery. Rural connections drop. A clerk who presses Save and sees no response will press it again. The browser creates a random id for each form (`crypto.randomUUID`, with a fallback for plain HTTP). The server stores it on the row and enforces uniqueness per cooperative. A repeat returns the original record with the same receipt number. A deliberately new delivery of the same farmer, produce and weight is a different form with a different id, so it is still allowed.

## 11. Front end structure

- `AuthContext` loads `/auth/me` on start, exposes `login`, `logout`, the idle timer, and shows the "signed out after 15 minutes" notice. A global `agri:signed-out` event, fired by `api.js` on any unexpected 401, makes sure the screen returns to login.
- Route guards: `RequireAuth` (signed in), `RequireRole` (roles list), `GuestOnly` (login and signup). They are for experience, the server is the control.
- `LedgerContext` loads shared data and exposes mutation functions. Each returns `{data}` or `{error: {field, message}}`, so a form can put the server's message beside the field that caused it.
- Forms use a small `useForm` hook with validation on blur and on submit. Client validation is a convenience. The server validates again.
- Accessibility: every input has a label, errors are tied to fields, buttons carry visually hidden context (for example "Void D-000012"), tables collapse to labelled rows on a phone.
- Money is displayed with thousands separators and "RWF", and large tap targets are used for phone browsers.
- Light and dark themes use semantic colour tokens (`--bg`, `--paper`, `--ink`, `--line` and others). `dark.css` redefines them under `.theme-dark` on the app, the landing page and the sign in pages, so no component carries its own dark colours. `useTheme()` stores the choice in `localStorage` under `agri-theme`, falls back to the device setting, and animates the switch with the View Transitions API where the browser has it (an instant switch elsewhere, and when the person asks for reduced motion). The palette itself does not change between themes.
- The landing page (`/`) is public. Its totals (cooperatives, active farmers, deliveries, kilograms) come from `GET /api/public/stats`, which needs no sign in and returns only counts across all cooperatives: no names and no per farmer amounts. Voided deliveries are not counted.
- `Wordmark` shows the logo mark beside the AgriCoopLedger name everywhere the name appears. `TitleManager` sets the tab title to `AgriCoopLedger | <page>` on each route (the home page is just `AgriCoopLedger`). The tab icon is the logo on a linen tile, so the dark book stays visible on a dark browser tab.
- Reports print through the browser's print dialog (Save as PDF) and download as CSV. The CSV writer prefixes cells that start with `= + - @` with an apostrophe so a spreadsheet cannot run a farmer's name as a formula.

## 12. Security checklist

| Threat | Control |
|---|---|
| Stolen password database | argon2 hashes |
| Guessing which usernames exist | Same error and same timing for unknown user and wrong password |
| Forged or edited session | Signed cookie, role read from the database each request |
| Stolen session by script | HttpOnly cookie. Secure flag when `COOKIE_SECURE=true` |
| Cross-site request forgery | `SameSite=Lax` cookie, JSON bodies only |
| Left-open screens | 15 minute idle timeout enforced on the server |
| Reading another cooperative's data | `cooperative_id` on every query, 404 on a miss |
| Privilege escalation | `require_role` on every write route, tested for every role |
| SQL injection | SQLAlchemy parameters, no string built queries |
| Quietly altering history | No delete routes, audit hash chain |
| Spreadsheet formula injection | CSV cell escaping |
| Traffic sniffing | HTTPS through Caddy in the hosted demo |
| Data loss | Daily pg_dump, 14 days kept |

Not done: sign-in rate limiting (argon2's cost is the only brake), two factor sign in, field level encryption of national IDs in the database.

## 13. Testing and what was verified

- **204 pytest tests** run against an in-memory SQLite database with separate cookie jars for each simulated person. They cover money rules against hand-calculated values, every role against every route, cooperative isolation, overpayment, voiding, corrections, usernames, duplicate submissions, the audit chain (including deliberately editing and deleting rows), paging, statements, reports, the dashboard, the idle timeout and the seed.
- **Browser test (Playwright, Chromium):** 60 checks (`scripts/e2e_smoke.py`, run against a seeded database with the backend and Vite running) across the three roles, the landing page, sign up and the sign in pages in both themes: navigation per role, a delivery with the half-up rounding, the correction request and approval, payment with the confirmation box, duplicate reference refusal, voiding, price change, adding and editing staff, the audit integrity check, a statement, no horizontal scroll at phone width, and the redirect when signed out. A separate run advanced the clock to confirm the 15 minute sign-out.
- **Second browser run:** 13 checks (`scripts/e2e_new.py`) for the newer features, including the offline queue with the connection cut. A crawl of every page for each role found no broken link, and the layout was checked from 360 to 1700 px wide.
- **Hosted copy:** deployed on Render (Docker web service plus PostgreSQL). Health, sign in and the seeded demo were confirmed. A ping from cron-job.org returned 200.
- **Performance script:** a year of synthetic data, measured on SQLite in process.
- **Not verified:** the local Docker compose stack, concurrent requests on PostgreSQL (the hosted copy runs on it, but the lock was not tested under load), the backup container, the Backblaze upload and a restore, the Caddy HTTPS setup, Microsoft Edge, a real Android phone, a real print dialog on a printer, how the tab icon looks in a real browser, behaviour on a slow network, and load with real concurrent users on a hosted server. All testing ran in a cloud container, not on your machine. Run `docker compose up`, seed, sign in as each role and run `python -m pytest` on your own machine before presenting.

## 14. SRS traceability

| SRS item | Where it is met |
|---|---|
| FR 1.1 log in with username and password | `routers/auth.py`, `Login.jsx`. The phone number is also accepted |
| FR 1.2 log out | `/auth/logout`, Sign out in the side menu |
| FR 1.3 Manager creates, deactivates, edits accounts | `routers/users.py`, `Staff.jsx`, `AddStaff.jsx` |
| FR 1.4 assign roles | Role chosen at creation, Change role on the Staff page |
| FR 1.5 each user only sees permitted functions | `deps.require_role` on the server, role based menu and route guards in the browser |
| FR 2.1 to 2.4 farmers: register, edit, search, deactivate | `routers/farmers.py`, `Farmers.jsx`, `FarmerForm.jsx`, `EditFarmer.jsx` |
| FR 3.1, 3.2 produce types and price per kg | `routers/produce.py`, `Produce.jsx` (Manager) |
| FR 3.3 view price history | Same page, read only for Clerk and Payment Officer |
| FR 4.1 record delivery, 4.5 value from the price on the delivery date | `routers/deliveries.py`, `services.value_of`, `services.price_on` |
| FR 4.2 delivery receipt | `Receipt.jsx`, print to PDF |
| FR 4.3 list filtered by farmer, produce, dates | `GET /deliveries` with server side filters and paging |
| FR 4.4 correct with a reason | Direct Manager correction and Clerk request, `corrections` table |
| FR 5.1 balance, 5.3 no overpayment | `services.balance_of`, checks in `routers/payments.py` |
| FR 5.2 record payment, 5.4 receipt, 5.5 void | `routers/payments.py`, `Receipt.jsx`, Manager void with a reason |
| FR 6.1 farmer statement | `GET /farmers/{id}/statement` |
| FR 6.2 collection report, 6.3 outstanding balances | `GET /reports/summary`, outstanding from farmer balances, `Reports.jsx` |
| FR 6.4 export | CSV download and print to PDF |
| FR 6.5 dashboard and produce mix | `GET /dashboard`, `GET /reports/produce-mix`, `Dashboard.jsx`, `ProduceMix.jsx` |
| FR 7.1 log changes, 7.2 view and filter log | `audit.py`, `routers/audit.py`, `AuditLog.jsx` |
| FR 9 landing page and open totals | `routers/public.py`, `Landing.jsx`, `FeatureTiles.jsx` |
| NFR 28 light and dark themes | `lib/theme.js`, `styles/dark.css` |
| NFR 1 to 4 performance | Measured only on SQLite in process, see section 13 |
| FR 3.4, 3.5 selling prices | `routers/produce.py`, `Produce.jsx` |
| FR 9.3, 9.4, FR 12 buyer side | `routers/public.py`, `routers/buyers.py`, `Buy.jsx`, `Sales.jsx` |
| FR 11 disputes | `routers/disputes.py` |
| NFR 5 daily backup | `backup` service in compose. Backblaze job script `backend/backup_to_b2.py` (not yet scheduled on Render) |
| NFR 6 confirmation before saving | Payment confirmation box, reason dialogs for void and correct |
| NFR 7 never permanently delete | No delete routes, void and correction records |
| NFR 8 reject invalid input | Pydantic validation on the server, the same checks in the browser |
| NFR 9 authenticate, NFR 10 password hash | Session login, argon2 |
| NFR 11 access by role, 14 farmer data privacy | `require_role`, national ID masking for the Payment Officer |
| NFR 12 HTTPS for hosted demos | `docker-compose.https.yml`, `Caddyfile` (untested) |
| NFR 13 session ends after 15 minutes | `deps.get_current_user` and the browser timer |
| NFR 15 audit | Audit log with hash chain |
| BR 1 to 7 | Sections 4, 5 and 7 |
| SRS 2.6 user guide | `docs/user-guide.md` |

SRS version 2.2 (`AgriCoopLedger_SRS_v2.2.docx`) describes the final build: three roles, grades A, B and C, join approval, farmer enrolment approval, payment batches, delivery and payment statuses, disputes, Manager selling prices, the buyer side, the Clerk's offline queue, strict input, the dashboard, the public landing totals and light and dark themes. What is not built (unidentified deliveries, collection point, member number, full offline use, a Board role, a farmer view) is in its Appendix D.

## 15. Decisions you may be asked about

- **Why integers for weight?** Floats cannot represent most decimals exactly, which is unacceptable in money. Grams as integers are exact.
- **Why compute balances instead of storing them?** A stored number can disagree with the records after a bug or a manual change. A computed one is always the sum of what is on record.
- **Why copy the price onto the delivery?** BR 3. Otherwise changing today's price would silently change last month's totals.
- **Why 404 for another cooperative's record?** A 403 confirms the record exists.
- **Why do the Manager and Clerk both have a correction path?** The Manager needs to fix a clear mistake quickly. The Clerk is closest to the weighing slip but must not alter their own record, so they ask and a different person decides.
- **Why SQLite for tests?** Speed and no setup. The models and queries avoid database specific features. The one PostgreSQL specific line, `FOR UPDATE`, is ignored by SQLite.
- **Why no Alembic yet?** `create_all` is enough while the schema is changing during development. Before real data exists, add migrations. Alembic is already in `requirements.txt`.
- **What would you do with more time?** Alembic migrations, sign-in throttling, publishing the audit chain head outside the database, a service worker so the offline queue survives a reload, buyer money funding farmer batches, unidentified deliveries, member numbers and collection points, thermal printer receipts.

## 16. How to run and demo it

```
cp .env.example .env
docker compose up
docker compose exec backend python -m app.seed
```

Open http://localhost:5173. Sign in as `aline` (Manager), `patrick` (Collection Clerk) or `claudine` (Payment Officer), password `harvest2026`. All data is synthetic.

A sensible demo order: Clerk records a delivery and prints the receipt. The Clerk requests a correction. The Manager approves it. The Payment Officer records a payment and tries to overpay. The Manager voids it. Show the farmer statement. Show the audit log and press Check integrity. Then, to show tamper detection, edit one audit row's summary directly in the database and press the button again.
