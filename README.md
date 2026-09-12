# SplitIt

Shared expense tracking and group settlement. A group logs what it spends, SplitIt nets every
expense down to one position per person, then works out the shortest set of transfers that ears
the whole group. Payments run through a mock sandbox gateway.

Built for B198c17 App & Web Development Studio, Gisma University of Applied Sciences @BY: Chady Oueslati GH1026563  .

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
npm test                  # 15 unit and API tests
```

Forgot-password emails need SMTP credentials in `.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS`, `SMTP_FROM`) — see the comments in `.env.example`. Nothing else in the app needs them;
without them, everything works except requesting a reset code.

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

**User** — name, unique email, bcrypt hash (never selected by default), default currency, an
optional avatar (a small data URI; `null` falls back to an initials avatar drawn client-side), and
`notificationsSeenAt` (when the notification feed was last opened, so unread counts survive a page
reload). Both email and password are optional: a guest joining by group code gets a lightweight
account with neither, flagged `isGuest`, and uses the app exactly like anyone else from that point
on.

**Group** — name, description, category, an icon (an emoji, defaulted per category unless the
creator picks their own), an optional photo (same data-URI pattern as a user avatar), currency,
embedded member subdocuments (user reference plus role), archived flag, a unique join code, and an
array of join requests (`{ user, message, status }`). Members are embedded because they are always
read with the group and a group holds a handful of people, not thousands. Join requests are
excluded from normal queries (`select: false`) so an ordinary fetch of a group cannot leak who has
asked to join.

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
| POST | `/auth/forgot-password` | Email a 6-digit reset code, if that address has an account |
| POST | `/auth/reset-password` | Set a new password with that code, and start a session |
| PATCH | `/auth/me` | Update your name or default currency |
| POST | `/auth/change-password` | Set a new password while signed in (current password required) |
| POST | `/auth/upgrade` | Turn a guest account into a full one by adding an email and password |
| DELETE | `/auth/me` | Delete your account (current password required for full accounts) |
| PUT | `/auth/avatar` | Set a profile photo (a resized data URI; see Security) |
| DELETE | `/auth/avatar` | Remove your profile photo, falling back to initials |
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
| GET | `/notifications` | Recent activity from your groups (other people's, not your own), plus an unread count |
| POST | `/notifications/seen` | Mark the notification feed as read, clearing the unread count |
| POST | `/join-requests` | Ask to join a group by its code — no account required |
| GET | `/join-requests/mine` | Your own join requests, across every group |
| GET | `/groups/:id/join-requests` | Pending requests for a group (owner only) |
| POST | `/groups/:id/join-requests/:requestId/decide` | Approve or decline a request (owner only) |
| POST | `/groups/:id/join-code/regenerate` | Issue a new join code, invalidating the old one (owner only) |

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
- Joining by code always goes through an approval step: the code adds a pending request, not
  membership. Only a member with the `owner` role can see or decide a group's pending requests, or
  regenerate its join code.
- Password reset codes are hashed the same way passwords are (never stored in plain text), expire
  after 10 minutes, allow at most 5 wrong guesses before a fresh code is required, and are rate
  limited to 5 requests per 15 minutes per IP since each one sends a real email. `forgot-password`
  always answers with the same generic message, whether or not the address has an account, so it
  cannot be used to check who is registered.
- Changing a password while signed in, and deleting a full account, both require the current
  password — a stolen session cookie alone isn't enough to lock the real owner out or erase the
  account.
- Deleting an account never corrupts another member's ledger: if the account paid for an expense
  or is on either side of a settlement, it's anonymized to a nameless placeholder instead of being
  removed outright, so those numbers stay attributable and correct. An account with no such history
  is deleted for real. Either way, leaving a group that still has other members promotes the
  longest-standing one to owner if that was the only owner; a group left with no members is deleted
  along with its expenses, settlements, and activity log.
- A payment is rejected unless the ledger actually shows the payer owing at least that much.
- All user-supplied text passes through `UI.escape` before it reaches the DOM.
- Profile photos are resized to a small square JPEG in the browser before upload, sent as a
  `data:` URI, and validated server-side against a strict format and a hard size cap — the route
  that accepts them is the only one with a raised body-size limit, scoped so the rest of the API
  keeps its tight 100kb ceiling.

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

## Small touches

- **Dark mode** — a toggle in the nav (`ui.js`'s `bindThemeToggle`), persisted in `localStorage`
  and applied before first paint by `public/js/theme-init.js` (loaded in `<head>`, so there's no
  flash of the wrong theme). Falls back to the OS's `prefers-color-scheme` if never toggled.
- **Confetti** — a short canvas burst (`UI.confetti()`) plays once when a group's balances all
  hit zero, and is ready to fire again if a later expense knocks it back out of balance.
- **Group icons** — an emoji per group, defaulted per category or picked from a quick-select row
  when creating one, shown next to its name everywhere.
- **Avatars** — a photo if you've set one, otherwise a colored initials circle, consistent per
  person (`UI.avatarHtml`), shown throughout the app rather than plain names.
- **Group photos** — the same upload-and-resize pattern as avatars, applied to groups; falls back
  to the group's emoji icon when there isn't one.
- **Notifications** — a bell in the nav opens a dropdown of recent activity from your groups
  (`UI.bindNotifications`), with an unread badge that clears when you open it, backed by
  `GET /notifications` / `POST /notifications/seen` and `User.notificationsSeenAt`.
- **Sign-out confirmation** — a small modal (`UI.confirmModal`) instead of the browser's native
  `confirm()`, asking "Are you sure you want to sign out?" before the session actually ends.

---

## Known limits

- The payment gateway is a local mock. No real money moves and no card data is stored.
- Exact and weighted splits are supported by the API but the expense form only offers an equal
  split; the other two are exercised through the API and the seed script.
- Single currency per group. There is no FX conversion between groups.
- No email delivery, so a member has to have an account before they can be added by email. Joining
  by group code sidesteps this: no email or account is needed, just the code and an owner's
  approval.
- A leftover unique index from before guest accounts existed (a non-sparse index on `User.email`)
  will reject every second guest with a duplicate-key error on any database that predates this
  feature. `connectDB` calls `syncIndexes()` on boot to replace it automatically.
