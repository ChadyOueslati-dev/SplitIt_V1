# SplitIt

Shared expense tracking and group settlement. A group logs what it spends, SplitIt nets every
expense down to one position per person, then works out the shortest set of transfers that clears
the whole group. Payments run through a mock sandbox gateway.

Built for B198c17 App & Web Development Studio, Gisma University of Applied Sciences.

Stack: HTML, CSS and vanilla JavaScript on the front end. Node.js, Express and MongoDB with
Mongoose on the back end. JWT sessions in an HttpOnly cookie. Docker and Docker Compose for
deployment.

---

## Run it

### With Docker Compose (nothing else to install)

```bash
docker compose up --build
# then, in a second terminal, load the demo data:
docker compose exec app node scripts/seed.js
```

Open http://localhost:3000

### Without Docker

You need Node 18+ and a MongoDB instance (local or Atlas).

```bash
cp .env.example .env      # then set JWT_SECRET and MONGODB_URI
npm install
npm run seed              # optional demo data
npm start                 # or npm run dev for auto-reload
npm test                  # 11 unit and API tests
```

### Demo accounts

After `npm run seed`, sign in with any of these. Password for all four: `password123`

| Email | Position after seeding |
|---|---|
| chady@example.com | owed money in both groups |
| amina@example.com | owed money in the trip |
| bea@example.com | owes money |
| tomas@example.com | owes money, has one completed payment |

To see a declined payment, use card number `4000 0000 0000 0000` on the Settle up page. Anything
else that is at least 12 digits succeeds.

---

## How the settlement works

Two steps, both in `src/services/ledger.js`.

**1. Net position.** Every member gets one number: everything they paid, minus every share they
owe, minus any completed settlement. Positive means the group owes them. The positions in a group
always sum to zero, which is asserted in the test suite.

**2. Greedy matching.** Repeatedly pair the largest debtor with the largest creditor and transfer
the smaller of the two amounts. Each pass zeroes at least one person, so a group of n settles in at
most n-1 transfers. Tracking every pair instead would produce up to n(n-1)/2 IOUs: 15 for six
people against 5 here.

Money never touches a float. Amounts are stored as integer cents, and `splitEqually` hands out the
remainder one cent at a time, so 10.00 across three people becomes 3.34 / 3.33 / 3.33 rather than
three lots of 3.3333.

---

## Project layout

```
server.js                 Express app, middleware chain, static hosting
src/config/db.js          Mongoose connection
src/models/               User, Group, Expense, Settlement, Activity
src/middleware/auth.js    JWT issue, verify, requireAuth guard
src/middleware/error.js   asyncHandler, httpError, 404 and error handlers
src/services/money.js     Cent conversion, equal and weighted splits
src/services/ledger.js    Net balances and debt simplification
src/services/payments.js  Mock payment gateway
src/controllers/          Request handling per resource
src/routes/index.js       All API routes with express-validator rules
public/                   Front end: 7 pages, one stylesheet, 9 scripts
scripts/seed.js           Demo data
tests/                    Unit tests for the ledger, smoke tests for the API
```

---

## Data model

**User** — name, unique email, bcrypt hash (never selected by default), default currency.

**Group** — name, description, category, currency, embedded member subdocuments (user reference
plus role), archived flag. Members are embedded because they are always read with the group and a
group holds a handful of people, not thousands.

**Expense** — group and payer references, description, category, `amountCents`, split method, and
an array of shares (`{ user, amountCents, weight }`). A pre-validate hook rejects any expense whose
shares do not add up to the total, so the ledger cannot drift.

**Settlement** — group, from, to, amount, method, status (`pending`, `processing`, `completed`,
`failed`), unique gateway reference, failure reason. Only completed settlements affect balances.

**Activity** — an append-only log of who did what, used by the dashboard and the Activity page.

---

## API

All routes are prefixed with `/api`. Everything except register, login and logout requires the
session cookie.

| Method | Route | Purpose |
|---|---|---|
| POST | `/auth/register` | Create an account and start a session |
| POST | `/auth/login` | Start a session |
| POST | `/auth/logout` | Clear the session cookie |
| GET | `/auth/me` | The signed-in user |
| GET | `/users?q=` | Search people by name or email |
| GET | `/groups?q=&category=&archived=` | Your groups, each with your net position |
| POST | `/groups` | Create a group, optionally with member emails |
| GET | `/groups/:id` | One group with populated members |
| PATCH | `/groups/:id` | Rename, recategorise, archive |
| POST | `/groups/:id/members` | Add a member by email |
| GET | `/groups/:id/balances` | Net positions plus simplified transfers |
| GET | `/groups/:groupId/expenses` | Filter by text, category, payer, amount range, date range; paginated |
| POST | `/groups/:groupId/expenses` | Add an expense (equal, exact or weighted split) |
| GET | `/groups/:groupId/expenses/breakdown` | Aggregation pipeline: totals per category |
| GET / PATCH / DELETE | `/expenses/:id` | Read, edit, remove one expense |
| GET | `/settlements?groupId=&status=` | Payment history, paginated |
| POST | `/settlements` | Run a payment through the mock gateway |
| GET | `/groups/:groupId/settlement-suggestions` | The transfers SplitIt recommends |
| GET | `/activity?groupId=&action=` | The audit trail, paginated |
| GET | `/dashboard` | Headline totals and recent events |

Errors always come back as `{ "error": "message a person can read" }` with a matching status code.

---

## Security

- Passwords hashed with bcrypt at 12 rounds; the hash is `select: false` so it never leaks through
  a normal query.
- JWT in an HttpOnly, SameSite=Lax cookie, marked Secure in production.
- `express-validator` on every write route.
- Helmet with a content security policy that only opens up the Google Fonts origins.
- Rate limit of 300 API requests per 15 minutes per IP.
- Membership is checked on every group, expense and settlement route, so no one can read or write
  another group's data by guessing an ID.
- A payment is rejected unless the ledger actually shows the payer owing at least that much.
- All user-supplied text passes through `UI.escape` before it reaches the DOM.

---

## Requirement coverage

| Brief requirement | Where it lives |
|---|---|
| Landing page | `public/index.html`, with a live worked example of the simplification |
| Dynamic pages over structured data | `dashboard.html`, `groups.html`, `group.html`, `settle.html`, `activity.html` |
| Create and update through forms | New group, new expense, add member, edit and delete expense, payment form |
| Search and filtering | Group search by name and category; expenses by text, category, payer, amount range, date range; activity by group and event type; all paginated |
| Workflow or transaction simulation | Settle up: suggested transfers, mock card gateway, success and decline paths, ledger updates on success |
| History or activity dashboard | `activity.html` for the audit trail, `settle.html` for payment history, `dashboard.html` for totals |
| Responsive front end in HTML, CSS, JS | `public/css/app.css` with no framework; layout collapses to one column below 820px |
| Node.js and Express back end | `server.js`, `src/routes`, `src/controllers` |
| Database | MongoDB via Mongoose, five collections |
| RESTful CRUD APIs | Table above |
| Third-party style integration | Mock payment gateway in `src/services/payments.js`, modelled on a sandbox card API |
| Deployment configuration | `Dockerfile` (multi-stage, non-root, healthcheck) and `docker-compose.yml` |

---

## Known limits

- The payment gateway is a local mock. No real money moves and no card data is stored.
- Exact and weighted splits are supported by the API but the expense form only offers an equal
  split; the other two are exercised through the API and the seed script.
- Single currency per group. There is no FX conversion between groups.
- No email delivery, so a member has to have an account before they can be added by email.
