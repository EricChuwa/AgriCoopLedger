# AgriCoopLedger

A record-keeping system for agricultural cooperatives in Rwanda. It replaces paper-based produce collection and farmer payment records with one digital ledger: who delivered what, what it was worth, what was paid, and what is still owed.

> Status: built to SRS v2.2 (FR 1 to 12, NFR, BR) for the course prototype, with the documented gaps listed below. The front end talks to the real API and database. It uses synthetic seed data only. A demo copy is hosted on Render (see Hosted demo on Render).

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
| Manager | Create and edit staff and assign roles, approve or decline proposed farmers and payment batches, set prices and produce, correct deliveries, void deliveries and payments, approve or reject correction requests, set buying and selling prices, decide disputes, read and verify the audit log, see reports, read the buyer side | Record a delivery, a payment, a sale or a buyer payment (BR 2, BR 11) |
| Collection Clerk | Propose and edit farmers, record deliveries, print delivery receipts, ask a Manager to correct a delivery, raise a dispute on a delivery, answer buyer order requests, record counter sales and buyer payments, read prices | Record payments, void deliveries, set prices |
| Payment Officer | Record payments, make payment batches and pay from them, print payment receipts, raise a dispute on a payment, confirm or reject buyer payments, see reports, read prices | Record deliveries, see full national IDs (masked, NFR 14) |

## What it does

- Farmers with a unique 16 digit national ID per cooperative, phone, village and membership date. Search by name, ID, phone or village.
- Produce with a price per kg for each grade (A, B, C) and an effective date. Every price is kept as history.
- Deliveries store the price in force on their date, so a later price change never rewrites old deliveries. Weight is held as whole grams, value is rounded half up to a whole franc.
- Balance owed = live deliveries minus live payments. A payment above the balance is refused.
- Nothing is deleted. A Manager voids an entry or corrects a delivery with a reason, and the old values stay on record. A Clerk can send a correction request, and a Manager approves or rejects it.
- Farmer enrolment approval: a Clerk proposes a farmer and a Manager approves or declines. A Manager adds farmers directly.
- Payment batches: a Payment Officer groups farmers' balances into a batch, a Manager approves it, then payments are recorded against it. Part paid and paid are worked out from the payments.
- Delivery and payment statuses, worked out from the records: recorded, correction pending, disputed or voided, and unpaid, in batch, part paid or paid.
- Disputes: a Clerk disputes a delivery, a Payment Officer a payment, and a Manager decides with a note. Upholding changes no amount. A correction or void does.
- Selling prices: only the Manager sets them (per produce and grade, with a start date). The screen suggests the buying price plus 20 percent, rounded up to 10 RWF. A sale needs a selling price.
- Buyer side: a public Buy page shows stock (kilograms only, no prices) and takes order requests (3 open per phone number). A Clerk accepts (a sale from stock) or declines, records counter sales and buyer payments, and a Payment Officer confirms them. The Manager reads only.
- Offline deliveries: a Clerk's deliveries are kept on the device when the network is down and sent automatically later, once each.
- Receipts for deliveries and payments, printable or saved as PDF from the browser.
- Reports: collection summary by produce, grade and period; farmer statement with opening balance; outstanding balances. Print or save as PDF, or download CSV.
- Audit log of who did what and when, written in the same database transaction as the change. Read only, and only for a Manager. Entries are chained with SHA-256 hashes, and a Manager can press Check integrity to detect an entry that was edited or removed in the database.
- Recording a delivery or payment twice by accident (double click, retry after a lost connection) is blocked: each form submission carries a one-time id and the server records it once.
- Lists are paged and filtered on the server (25 a page), and totals, statements, reports and the dashboard are worked out on the server, so a year of data does not have to be downloaded to the browser.
- Sessions end after 15 minutes without activity (checked on the server, and the screen signs out too).
- Passwords are hashed with argon2. Staff sign in with a username (the phone number also works) and can change their own password.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React (JavaScript), Vite, React Router |
| Backend | Python, FastAPI, SQLAlchemy 2 |
| Database | PostgreSQL (SQLite for tests and quick local runs) |
| Auth | Signed session cookies, argon2 |
| Tests | pytest |
| Run | Docker Compose |

Money is whole RWF integers, never floats.

## Project structure

```
backend/app/        FastAPI app: models, schemas, routers, services, seed
backend/tests/      pytest suite
frontend/src/       React app
docs/               SRS and architecture design
docker-compose.yml  database, backend, frontend, daily backup
```

## Getting started

Requires Docker.

```
cp .env.example .env
docker compose up
```

- App: http://localhost:5173
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

Or sign up on the site. A new cooperative name creates the cooperative and makes you its Manager. A name that is already registered sends a request to that cooperative's Manager, who approves it with a role (or declines it) under Staff. The person cannot sign in until the Manager approves.

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

For a local SQLite file, stop the backend, delete the `.db` file and run `python -m app.seed` again. `--reset` cannot be used on an old file, because it reads the new columns before it wipes anything. The newest changes added tables (disputes, buyer side, selling prices). New tables are created on their own, but if you are upgrading from an older version, resetting once is the safe route.

Without Docker, delete `backend/agricoop.db` (or whichever SQLite file you use) and run `python -m app.seed` again.

## Hosted demo on Render

The repository has a `render.yaml` Blueprint: one web service (built from `Dockerfile.render`, serving the API and the built front end from one address) and a free PostgreSQL database. Pushing to `main` rebuilds it. `SEED_DEMO=true` loads the demo cooperative the first time. Steps, the keep-awake ping and the Backblaze backup job are in `docs/DEPLOY_RENDER.md`. Live demo: https://agricoopledger.onrender.com/

## Hosted demo with HTTPS on your own server (NFR 12)

On a server with a domain pointing at it and ports 80 and 443 open:

```
DOMAIN=agricoop.example.com SECRET_KEY=<long random value> \
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build web
```

Caddy gets and renews the certificate, redirects HTTP to HTTPS, serves the built front end and forwards `/api` to the backend, which then marks the session cookie Secure. This setup has not been run end to end yet.

## Tests

```
cd backend
python -m pytest
```

The suite (204 tests) checks the money rules against hand-calculated values (for example 12.345 kg at 700 RWF per kg is 8,642 RWF), every role against every route, overpayment, voiding, corrections, the audit trail, cooperative isolation, the 15 minute session limit, duplicate submissions, the audit hash chain, paging, statements, reports and the seed data.

## Backups

The `backup` service in `docker-compose.yml` writes a compressed `pg_dump` to `./backups` once a day and keeps 14 days (SRS NFR 5). Restore with:

```
docker compose exec -T db pg_restore -U agri -d agricoopledger --clean --if-exists < backups/<file>.dump
```

## Known gaps and decisions

These are deliberate and stated so nobody has to find them:

- SRS v2.2 describes the build. Offline entry, farmer enrolment approval, payment batches, disputes, selling prices and the buyer side are built. Not built: unidentified deliveries and manual identification, collection point and member number, full offline use, buyer money funding farmer batches, a Board role and a farmer view. See Appendix D of the SRS.
- Public order requests are limited only by 3 open requests per phone number. The public totals and stock are not rate limited.
- Offline works for the Clerk's deliveries only. There is no service worker, so a page reload without a connection fails. The queue is stored in the browser on that device. A direct payment is still allowed beside batches.
- Farmers are not paged: the whole farmer list (a few hundred rows) is loaded and filtered in the browser.
- The audit chain detects edits and removal of entries from the middle of the log. It does not detect removal of the newest entries, and anyone who can rewrite the whole table and recompute every hash could forge it. Keep database access to the administrator.
- HTTPS (NFR 12) is provided by Render on the hosted demo. The Caddy setup for your own server is untested. Local runs use HTTP.
- On Render's free plan the database expires after 30 days and the web service sleeps when idle (a scheduled ping from cron-job.org keeps it awake). The daily backup runs in Docker Compose. A backup of the hosted database to Backblaze is planned and not yet set up.
- Schema is created with `create_all`, not Alembic migrations, so a schema change needs a database reset.
- No sign-in throttling beyond argon2's cost.
- Measured on SQLite with a year of data (5,475 deliveries, 300 farmers): every endpoint under 40 ms and a page of deliveries is about 8 KB. Not measured on PostgreSQL, over a real network or against NFR 1 on a hosted server.
- The Docker stack, PostgreSQL concurrency, the backup service and a restore were not run in the environment the code was tested in. The Render build worked and the hosted demo runs on PostgreSQL.
- Tested in Chromium. Edge uses the same engine but was not run separately. Android phone browsers were checked only through a narrow viewport, not a device.

## Repository

https://github.com/EricChuwa/AgriCoopLedger

## Author

Eric Cyril Chuwa, Software Engineering, African Leadership University
