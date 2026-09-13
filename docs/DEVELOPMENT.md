# Developer Guide

> **Clone → configure → run in under 5 minutes.**

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Project Structure](#project-structure)
4. [Common Commands](#common-commands)
5. [Key Patterns](#key-patterns)
6. [Adding a New API Endpoint](#adding-a-new-api-endpoint)
7. [Adding a New Tab / View](#adding-a-new-tab--view)
8. [Database Migrations](#database-migrations)
9. [Production Deploy](#production-deploy)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Docker + Docker Compose v2 | 24+ |
| `openssl` | any |
| `bash` | 4+ |

> No Go or Node.js required on the host — both compile inside Docker.

---

## Quick Start

```bash
cp .env.example .env      # no edits needed for local dev
chmod +x start.sh init-secrets.sh
./start.sh                # generates secrets, builds images, starts all services
```

Open **https://localhost** (accept the self-signed cert warning on first visit).

`./start.sh -d` runs in detached/background mode. `./start.sh --reset` wipes all volumes and secrets and starts fresh — **never use `--reset` in production**.

---

## Project Structure

```
go-finance-tracker/
├── backend/
│   ├── main.go          — route registration, server config
│   ├── handlers.go      — categories, expenses, reports, export, recurring endpoints
│   ├── auth.go          — register/login/refresh/logout + token helpers
│   ├── db.go            — connection pool, migration runner
│   ├── middleware.go    — CORS, JWT auth
│   ├── models.go        — domain types, token TTL constants
│   └── migrations/      — numbered .up.sql files (embedded in binary)
│       ├── 001_init.up.sql
│       ├── 002_refresh_token.up.sql
│       └── 003_recurring_expenses.up.sql
│
└── frontend/src/
    ├── Dashboard.tsx    — tab shell, data owner, action wiring
    ├── api.ts           — apiFetch, token storage, proactive refresh
    ├── types.ts         — interfaces, action contracts, TABS order
    ├── hooks/
    │   ├── useExpenseData.ts    — centralised read hook (expenses, categories,
    │   │                          availableYears, recurringItems, recurringSummary,
    │   │                          fetchCategoryPercent, fetchMonthlyTrend,
    │   │                          fetchRecurring, fetchRecurringSummary, fetchExport)
    │   └── useClickOutside.ts  — generic outside-click hook
    ├── components/
    │   └── SelectAllCheckbox.tsx — tri-state select-all (unchecked/indeterminate/checked)
    └── views/
        ├── DashboardView.tsx  — year/month filter, category breakdown, monthly trend, CSV export
        ├── AddExpense.tsx     — add expense form
        ├── Categories.tsx     — create/rename/delete + select-all bulk delete
        ├── ExpenseViewer.tsx  — filter/edit/delete table + select-all bulk delete
        └── RecurringView.tsx  — recurring templates CRUD + select-all + dump to expenses
```

---

## Common Commands

### Backend

```bash
docker compose up --build backend -d   # rebuild + restart backend
docker compose logs backend --follow   # live logs
docker compose exec backend go test ./...
docker compose exec db psql -U postgres -d financedb   # DB shell
```

### Frontend

```bash
cd frontend && npm install && npm run dev   # Vite dev server at :5173 (proxies /api → :8080)
docker compose up --build frontend -d      # rebuild frontend container
cd frontend && npx tsc --noEmit            # type-check without building
```

### All containers

```bash
docker compose ps
docker compose logs --tail 50 --follow
```

---

## Key Patterns

### Tab order
Controlled by `TABS` in `frontend/src/types.ts`. Current order: Overview → New Expense → Categories → My Expenses → Recurring.

### Token storage model
- **Access token** — `localStorage` key `finance_access_token`. Read by `api.ts`; decoded client-side to restore user identity without a round-trip.
- **Refresh token** — `__Host-refresh` HttpOnly cookie set by the server. JavaScript never reads or writes it. The browser sends it automatically on `POST /api/auth/refresh` via `credentials: 'same-origin'`. This means XSS cannot steal the long-lived token.
- Login/register responses return `{ accessToken, user }` only — no `refreshToken` in the JSON body.
- `App.tsx` calls `attemptRefresh()` with no body on startup if the access token is expired; the cookie is sent automatically.

### Rate limiting
`rateLimitMiddleware` in `middleware.go` wraps `/api/auth/login` and `/api/auth/register`. 10 attempts per IP per 5-minute window; returns `429` when exceeded. Reads `X-Forwarded-For` for the real client IP behind Caddy. Background goroutine cleans stale entries every 10 minutes.

### Data fetching — Dependency Inversion
Views **never** import `apiFetch`. All fetch callbacks are injected as props from `Dashboard.tsx` (sourced via `useExpenseData`). This keeps views independently testable with mocks.

### `useExpenseData` hook
Single source of truth for read-only server data. Returns `expenses`, `categories`, `availableYears` (derived via `useMemo`), `recurringItems`, `recurringSummary` (`{ count, total }` from `GET /api/recurring/summary`), plus stable callbacks: `fetchCategoryPercent(year, month)`, `fetchMonthlyTrend(year, month)`, `fetchRecurring()` (lazy — not called on boot, triggered when the Recurring tab is first opened), `fetchRecurringSummary()` (fetches server-computed count + total; called in parallel with `fetchRecurring` via `Promise.all`), and `fetchExport(from, to)` (builds query params, fetches blob, triggers browser download). Pass `'all'` to skip a year/month filter.

### CSV export
`fetchExport(from, to)` in `useExpenseData` calls `GET /api/expenses/export?from=YYYY-MM-DD&to=YYYY-MM-DD`. The backend streams CSV directly to the response with `Content-Disposition: attachment; filename="expenses_…csv"`. The frontend creates a temporary `<a>` element with a blob object URL, clicks it, then calls `URL.revokeObjectURL` to free memory.

### `buildFilter` helper (backend)
`buildFilter(r, "e", 2)` builds an optional `AND EXTRACT(YEAR …) / MONTH …` clause from `?year=` / `?month=` query params. Used by `getExpenses`, `getCategoryPercentage`, and `getMonthlySummary`.

### SelectAllCheckbox
Tri-state checkbox in `components/SelectAllCheckbox.tsx`. Sets the native `indeterminate` DOM property via `useRef` + `useEffect` (not settable through JSX). Reuse this component for any bulk-select table header.

---

## Adding a New API Endpoint

1. **Handler** in `backend/handlers.go` — call `userIDFromContext(r)`, use `buildFilter` if year/month filtering is needed, respond with `jsonResponse`. Add `http.MaxBytesReader(w, r.Body, 1<<20)` at the top of any POST/PUT handler.
2. **Route** in `backend/main.go` — `mux.Handle("/api/...", auth(myHandler))`. For a new public auth endpoint, wrap with `rateLimitMiddleware(handler)` instead.
3. **Type** in `frontend/src/types.ts` — add the response interface.
4. **Fetch callback** in `useExpenseData.ts` — add a stable `useCallback` and include it in the return object.
5. **Wire** in `Dashboard.tsx` — pass the callback as a prop to the view that needs it.
6. Rebuild: `docker compose up --build backend -d`

---

## Adding a New Tab / View

1. Create `frontend/src/views/MyView.tsx` — accept a typed `Props` interface, no `apiFetch` import.
2. Add the action interface to `types.ts`.
3. Add `'mytab'` to `TabName` and `TABS` in `types.ts`.
4. Add icon + label entries to `TAB_ICONS` / `TAB_LABELS` in `Dashboard.tsx`.
5. Wire a `useMemo` action object and render `{activeTab === 'mytab' && <MyView ... />}` in `Dashboard.tsx`.

No other files change.

---

## Database Migrations

Files live in `backend/migrations/` and are embedded in the binary at compile time. `m.Up()` runs on startup (no-op if already applied).

```bash
# New migration
touch backend/migrations/003_my_change.up.sql
# Apply
docker compose up --build backend -d
# Check state
docker compose exec db psql -U postgres -d financedb \
  -c "SELECT version, dirty FROM schema_migrations ORDER BY version;"
```

To fix a `dirty` migration: `UPDATE schema_migrations SET dirty = false WHERE version = N;` then restart the backend.

---

## Production Deploy

1. Provision a server with Docker; open ports 80 and 443.
2. Point an `A` record to the server IP and wait for DNS.
3. Clone the repo, `cp .env.example .env`, set `DOMAIN=yourdomain.com`.
4. `./start.sh -d` — Caddy auto-fetches a Let's Encrypt cert on first start.
5. Confirm: `curl https://yourdomain.com/api/auth/login -X POST -d '{}' -w '\nHTTP %{http_code}\n'` → `HTTP 400`.

Backups: `docker compose exec db pg_dump -U postgres financedb > backup_$(date +%Y%m%d).sql`

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `DB_URL not set` on start | Use `./start.sh`, not `docker compose up` directly |
| Backend exits immediately | `docker compose logs backend` — likely Postgres not ready yet; retry in 10 s |
| `dirty database version` | See migration section above |
| Blank page after deploy | `docker compose up --build frontend -d` |
| TypeScript error in Docker | Run `cd frontend && npx tsc --noEmit` locally first |
| Action interface mismatch (TS) | Each view takes its own typed interface — don't pass `CategoryActions` to `ExpenseViewer` |
| Port 80/443 in use | `sudo lsof -i :80` / `:443`, stop the conflicting process |
| Cert warning on `localhost` | Expected — Caddy self-signs locally; click through. On a real domain it auto-fetches Let's Encrypt |
| `429 Too Many Requests` on login | You have hit the rate limit (10 attempts / 5 min per IP). Wait for the window to expire. In dev, restart the backend to reset the in-memory counter. |
| Session not restored after deploy | The `__Host-refresh` cookie requires `Secure` — it will not be set over plain HTTP. Always access the app via `https://`. On localhost, accept the self-signed cert. |
| Refresh cookie not sent | Ensure all `fetch` calls use `credentials: 'same-origin'`. Without it the browser does not attach cookies, and `/api/auth/refresh` returns 401. |
