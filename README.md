# AgriCoopLedger

A record-keeping system for agricultural cooperatives in Rwanda. It replaces paper-based produce collection and farmer payment records with one digital ledger: who delivered what, what it was worth, what was paid, and what is still owed.

> Status: built to the SRS requirement tables (FR 1 to 7, NFR, BR) for the course prototype, with the documented gaps listed below. The front end talks to the real API and database. It uses synthetic seed data only. 133 backend tests pass, and a 60 check browser smoke test passes against the seeded demo.

Docs: [user guide](docs/user-guide.md) (SRS 2.6) and [technical briefing](docs/TECHNICAL_BRIEFING.md) (how it is built and why).

## Problem

Cooperatives in Rwanda commonly record produce intake and farmer payments on paper. This makes it hard to:

- Track how much each farmer delivered and when
- Calculate and verify what each farmer is owed
- Keep a reliable payment history
- Produce reports for members and management

## Roles

The SRS defines three roles. The server checks the role on every request, so hiding a button is never the only protection.

| Role | Can do | Cannot do |
|---|---|---|
| Manager | Create and edit staff and assign roles, set prices and produce, correct deliveries, void deliveries and payments, approve or reject correction requests, read and verify the audit log, see reports | Record a delivery or a payment (BR 2) |
| Collection Clerk | Register and edit farmers, record deliveries, print delivery receipts, ask a Manager to correct a delivery, read prices | Record payments, void, set prices |
| Payment Officer | Record payments, print payment receipts, see reports, read prices | Record deliveries, see full national IDs (masked, NFR 14) |

## What it does

- Farmers with a unique 16 digit national ID per cooperative, phone, village and membership date. Search by name, ID, phone or village.
- Produce with a price per kg for each grade (A, B, C) and an effective date. Every price is kept as history.
- Deliveries store the price in force on their date, so a later price change never rewrites old deliveries. Weight is held as whole grams, value is rounded half up to a whole franc.
- Balance owed = live deliveries minus live payments. A payment above the balance is refused.
- Nothing is deleted. A Manager voids an entry or corrects a delivery with a reason, and the old values stay on record. A Clerk can send a correction request, and a Manager approves or rejects it.
- Receipts for deliveries and payments, printable or saved as PDF from the browser.
- Reports: collection summary by produce, grade and period; farmer statement with opening balance; outstanding balances. Print or save as PDF, or download CSV.
- Audit log of who did what and when, written in the same database transaction as the change. Read only, and only for a Manager. Entries are chained with SHA-256 hashes, and a Manager can press Check integrity to detect an entry that was edited or removed in the database.
- Recording a delivery or payment twice by accident (double click, retry after a lost connection) is blocked: each form submission carries a one-time id and the server records it once.
- Lists are paged and filtered on the server (25 a page), and totals, statements, reports and the dashboard are worked out on the server, so a year of data does not have to be downloaded to the browser.
- Sessions end after 15 minutes without activity (checked on the server, and the screen signs out too).
- A dashboard for each role. The produce mix chart can show the week, month or quarter. Reports and receipts print on A4 with their own print layout.
- Light and dark mode on the landing page, the sign in and create account pages, and the signed-in app. The choice is saved in the browser and shared by all three. Printed pages always stay light.
- A public landing page with live totals (cooperatives, farmers, deliveries, kilograms) read from the database through `GET /api/public/stats`. It returns counts only, and voided deliveries and inactive farmers are not counted.
- Passwords are hashed with argon2. Staff sign in with a username (the phone number also works) and can change their own password.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React (JavaScript), Vite, React Router |
| Backend | Python, FastAPI, SQLAlchemy 2 |
| Database | PostgreSQL (SQLite for tests and quick local runs) |
| Auth | Signed session cookies, argon2 |
| Tests | pytest (backend), Playwright smoke script (browser) |
| Run | Docker Compose |

Money is whole RWF integers, never floats.

## Project structure

```
backend/app/        FastAPI app: models, schemas, routers, services, seed
backend/tests/      pytest suite
frontend/src/       React app (pages, components, styles, assets/images)
scripts/            browser smoke test (Playwright)
docs/               SRS and architecture design
docker-compose.yml  database, backend, frontend, daily backup
```

## Getting started

Requires Docker.

```
cp .env.example .env
docker compose up
```

- App and landing page: http://localhost:5173
- API health check: http://localhost:8000/api/health

Load the demo cooperative (synthetic data) in a second terminal:

```
docker compose exec backend python -m app.seed
```

Sign in with a username and the password `harvest2026`:

| Role | Username | Phone (also works) |
|---|---|---|
| Manager | aline | 0788 000 001 |
| Collection Clerk | patrick | 0788 000 002 |
| Payment Officer | claudine | 0788 000 003 |

`python -m app.seed --reset` rebuilds the demo cooperative.

Or sign up on the site and choose what you are signing up as. **Manager** starts a new cooperative (the name must not be registered yet) and you can sign in straight away. This is how a Manager account is created. **Collection Clerk** or **Payment Officer** asks to join an existing cooperative by its exact name; its Manager approves the request under Staff (keeping the role asked for or choosing another), or declines it. The person cannot sign in until the Manager approves.

The database now has a `users.approval` column. If you have an older database, reset it as described below before running the new code.

Without Docker:

```
# backend (uses a local SQLite file unless DATABASE_URL is set)
cd backend
pip install -r requirements.txt
python -m app.seed
uvicorn app.main:app --reload

# frontend
cd frontend
npm install
npm run dev
```

### If you have an older database

The tables changed (usernames, one-time submission ids, the audit hash chain, roles, grades, national ID, corrections) and the app creates missing tables but does not migrate old ones. Reset once:

```
docker compose down -v      # removes the database volume
docker compose up
docker compose exec backend python -m app.seed
```

Without Docker, delete `backend/agricoop.db` (or whichever SQLite file you use) and run `python -m app.seed` again.

## Hosted demo with HTTPS (NFR 12)

On a server with a domain pointing at it and ports 80 and 443 open:

```
DOMAIN=agricoop.example.com SECRET_KEY=<long random value> \
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build web
```

Caddy gets and renews the certificate, redirects HTTP to HTTPS, serves the built front end and forwards `/api` to the backend, which then marks the session cookie Secure. This setup has not been run end to end yet.

## Tests

Backend:

```
cd backend
python -m pytest
```

The suite (133 tests) checks the money rules against hand-calculated values (for example 12.345 kg at 700 RWF per kg is 8,642 RWF), every role against every route, overpayment, voiding, corrections, the audit trail, cooperative isolation, the 15 minute session limit, duplicate submissions, the audit hash chain, paging, statements, reports, the public landing totals and the seed data.

Browser smoke test (not part of pytest). It needs Playwright, a freshly seeded database, the backend on port 8000 and the frontend on port 5173:

```
pip install playwright && playwright install chromium
docker compose exec backend python -m app.seed --reset
python scripts/e2e_smoke.py
```

It signs in as each role and opens every screen that role can reach, checking for failed API calls and console errors. It also records a delivery and a payment, checks that a paid farmer leaves the payment list, creates a cooperative, sends and approves a join request, switches light and dark mode, and checks the landing and dashboard pages at phone width. It changes the data, so reset the seed before running it again.

## Backups

The `backup` service in `docker-compose.yml` writes a compressed `pg_dump` to `./backups` once a day and keeps 14 days (SRS NFR 5). Restore with:

```
docker compose exec -T db pg_restore -U agri -d agricoopledger --clean --if-exists < backups/<file>.dump
```

## Known gaps and decisions

These are deliberate and stated so nobody has to find them:

- The SRS Appendix B ideas (offline sync, farmer enrolment approval, payment batches, disputes) are not built. The core requirement tables (FR 1 to 7, NFR, BR) are the contract. The SRS contradicts itself in places (it names an Accountant in some sections and a Payment Officer in others, and one section assumes a single rate where another defines grades). The build follows the requirement tables and three roles.
- Online only. There is no offline mode.
- Farmers are not paged: the whole farmer list (a few hundred rows) is loaded and filtered in the browser.
- The audit chain detects edits and removal of entries from the middle of the log. It does not detect removal of the newest entries, and anyone who can rewrite the whole table and recompute every hash could forge it. Keep database access to the administrator.
- HTTPS (NFR 12) is for the hosted demo only and the Caddy setup is untested. Local runs use HTTP.
- Schema is created with `create_all`, not Alembic migrations, so a schema change needs a database reset.
- No sign-in throttling beyond argon2's cost.
- Measured on SQLite with a year of data (5,475 deliveries, 300 farmers): every endpoint under 40 ms and a page of deliveries is about 8 KB. Not measured on PostgreSQL, over a real network or against NFR 1 on a hosted server.
- Docker, PostgreSQL and the backup service were not run in the environment the code was tested in.
- `GET /api/public/stats` needs no sign in, so anyone can read the cooperative, farmer, delivery and kilogram totals. It holds no names or amounts, but remove it if totals should stay private.
- The sunset and sunrise animation when switching light and dark mode uses the browser View Transitions API. Browsers without it, and people who ask for reduced motion, get an instant switch.
- Tested in Chromium. Edge uses the same engine but was not run separately. Android phone browsers were checked only through a narrow viewport, not a device.

## Repository

https://github.com/EricChuwa/AgriCoopLedger

## Author

Eric Cyril Chuwa, Software Engineering, African Leadership University
