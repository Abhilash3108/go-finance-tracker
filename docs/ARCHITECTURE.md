# Architecture & Technology Decisions

> **Why every component was chosen, and how they fit together.**

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Go — Backend Language](#go--backend-language)
3. [PostgreSQL — Database](#postgresql--database)
4. [golang-migrate — Schema Management](#golang-migrate--schema-management)
5. [JWT Authentication — Access & Refresh Tokens](#jwt-authentication--access--refresh-tokens)
6. [Refresh Token Revocation](#refresh-token-revocation)
7. [React + TypeScript + Vite — Frontend](#react--typescript--vite--frontend)
8. [Tailwind CSS](#tailwind-css)
9. [Docker & Docker Compose](#docker--docker-compose)
10. [Caddy — Reverse Proxy & HTTPS](#caddy--reverse-proxy--https)
11. [nginx — Frontend Static Server](#nginx--frontend-static-server)
12. [Secret Management](#secret-management)
13. [SOLID Architecture in the Frontend](#solid-architecture-in-the-frontend)
14. [API Reference](#api-reference)
15. [Database Schema](#database-schema)
16. [Data Flow Diagrams](#data-flow-diagrams)

---

## System Overview

Finance Tracker is a four-service Docker Compose application:

```
Browser
  │
  ▼
Caddy (:443 / :80)          ← only public-facing ports
  ├── /api/*  ─────────────► Go Backend (:8080, internal)
  │                              │
  │                              ▼
  │                          PostgreSQL (:5432, internal)
  │
  └── /*  ────────────────────► nginx + React SPA (:80, internal)
```

Only Caddy exposes host ports (`80` and `443`). Backend (`:8080`) and frontend (`:80`) use Docker `expose`—they are reachable only within the compose network, never directly from the internet.

---

## Go — Backend Language

**Choice:** Go 1.21, standard library `net/http`.

**Why Go:**

| Concern | Decision |
|---------|----------|
| Performance | Compiles to a single static binary. Cold start ~5 ms. Standard `net/http` handles thousands of concurrent connections with minimal RAM—no separate app server needed. |
| Simplicity | `net/http` covers all routing needs. No framework, no middleware dependency tree. |
| Type safety | Static types catch entire classes of bugs at compile time rather than at runtime. |
| Deployment | Binary + `alpine` base image → ~15 MB Docker image vs ~800 MB on `golang:1.21`. |
| Concurrency | Goroutines and `net/http`'s per-request handler model handle I/O-bound DB calls without blocking threads. |

**Dependencies (`go.mod`):**

```
github.com/golang-jwt/jwt/v5         v5.2.1   — JWT signing and parsing
github.com/golang-migrate/migrate/v4  v4.17.1  — SQL migration runner (iofs source)
github.com/lib/pq                     v1.10.9  — PostgreSQL driver
golang.org/x/crypto                   v0.22.0  — bcrypt password hashing
```

The entire transitive dependency tree is 7 packages — trivially auditable. Three indirect dependencies (`hashicorp/errwrap`, `hashicorp/go-multierror`, `go.uber.org/atomic`) are pulled in by `golang-migrate`.

**Multi-stage Dockerfile:**

```dockerfile
# Stage 1 — compile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o server .

# Stage 2 — minimal runtime
FROM alpine:3.19
COPY --from=builder /app/server .
COPY migrations/ ./migrations/
CMD ["./server"]
```

The final image contains only the compiled binary and the embedded migration SQL files.

---

## PostgreSQL — Database

**Choice:** PostgreSQL 15 (Alpine image).

**Why PostgreSQL:**

| Concern | Decision |
|---------|----------|
| Numeric precision | `NUMERIC(12,2)` for `amount` avoids floating-point rounding errors inherent in `FLOAT`. |
| Data integrity | Foreign keys (`ON DELETE CASCADE` / `ON DELETE RESTRICT`) and `CHECK (amount > 0)` enforce correctness at the DB level, not just the application layer. |
| Uniqueness | `UNIQUE (name, user_id)` on categories prevents duplicate category names per user. |
| Timestamps | `TIMESTAMPTZ` stores timestamps with timezone, ensuring consistent ordering across locales. |
| ACID | Full transactional guarantees. |
| Concurrency | PostgreSQL handles concurrent connections properly; SQLite is single-writer and hits write contention under load. |

**Why not SQLite:** Write contention under concurrent requests makes it unsuitable for a networked API.

**Why not MySQL/MariaDB:** PostgreSQL's `TIMESTAMPTZ`, partial indexes, and `RETURNING` clause are cleaner than MySQL equivalents.

---

## golang-migrate — Schema Management

**Choice:** `golang-migrate/migrate/v4` with numbered `*.up.sql` files embedded via Go's `//go:embed` directive.

Migration files are embedded directly into the compiled binary:

```go
//go:embed migrations
var migrationsFS embed.FS
```

This means no external file mounting is needed in Docker—the binary is self-contained.

**Why numbered migrations instead of `CREATE TABLE IF NOT EXISTS` in `main.go`:**

| Problem with inline SQL | Solution with migrations |
|------------------------|--------------------------|
| No history | Each file is a permanent, ordered record of every schema change |
| Can't safely alter a live table | `ALTER TABLE` in migration 002 runs once on the live DB and never again |
| No rollback path | Paired `.up.sql` / `.down.sql` files support reversals |
| Collaboration risk | Team members apply the same numbered files in the same order |

`golang-migrate` tracks applied versions in a `schema_migrations` table it manages automatically.

**Migration files:**

```
backend/migrations/
├── 001_init.up.sql               — users, categories, expenses tables + indexes
├── 002_refresh_token.up.sql      — adds refresh_token_hash + refresh_token_exp to users
└── 003_recurring_expenses.up.sql — recurring_expenses table + indexes
```

At startup, `db.go` calls `m.Up()` which is a no-op if all migrations have already run.

---

## JWT Authentication — Access & Refresh Tokens

**Why JWT over sessions:** Sessions require server-side storage that must be replicated across instances. JWTs are stateless—any backend instance can validate a token by verifying the HMAC signature with the shared `JWT_SECRET`.

**Two-token design:**

| Token | TTL | Transport | Purpose |
|-------|-----|-----------|---------|
| Access token | **15 minutes** | `Authorization: Bearer <token>` on every API call | Short TTL limits exposure window if intercepted |
| Refresh token | **7 days** | `__Host-refresh` HttpOnly cookie (set by server, sent automatically by browser) | Never readable by JavaScript — XSS cannot steal it |

These constants are defined in `models.go`:

```go
const (
    accessTokenTTL  = 15 * time.Minute
    refreshTokenTTL = 7 * 24 * time.Hour
)
```

**Claims structure:**

```json
// Access token payload — now includes email so session restore needs no extra round-trip
{
  "sub":   42,
  "email": "user@example.com",
  "type":  "access",
  "iat":   1700000000,
  "exp":   1700000900
}

// Refresh token payload
{
  "sub":   42,
  "email": "user@example.com",
  "type":  "refresh",
  "iat":   1700000000,
  "exp":   1700604800
}
```

**`type` claim:** Both tokens are HMAC-SHA256 signed with the same `JWT_SECRET`. The `type` field prevents a refresh token from being accepted as an access token. `parseAccessToken` and `parseRefreshToken` each assert `claims["type"]` before accepting a token.

**Signing algorithm:** `HS256` (HMAC-SHA256). Symmetric signing is appropriate for a single-server deployment where the same process both signs and verifies.

**Client-side storage:**
- Access token: `localStorage` key `finance_access_token` — short-lived (15 min), acceptable XSS exposure window.
- Refresh token: `__Host-refresh` HttpOnly cookie — **never stored in or readable by JavaScript**. The browser sends it automatically on requests to the same origin.

**`__Host-` cookie prefix** enforces three browser-level rules regardless of server config: `Secure` attribute must be set, `Domain` attribute must be absent, `Path` must be `/`. This prevents a compromised subdomain from setting or overwriting the cookie.

**Cookie attributes:**
```
Set-Cookie: __Host-refresh=<token>; Path=/; Expires=<7d>; HttpOnly; Secure; SameSite=Strict
```

| Attribute | Effect |
|-----------|--------|
| `HttpOnly` | JavaScript (`document.cookie`, `localStorage`) cannot read it |
| `Secure` | Only sent over HTTPS — enforced by Caddy in this stack |
| `SameSite=Strict` | Not sent on cross-site requests — CSRF from a third-party site is blocked |
| `__Host-` prefix | Browser enforces `Secure` + no `Domain` + `Path=/` |

**Proactive refresh:** `apiFetch` in `api.ts` checks whether the access token is within 60 seconds of its `exp` timestamp and proactively refreshes before sending the request. The refresh call sends no body — the browser attaches the cookie automatically via `credentials: 'same-origin'`. This prevents a mid-flight expiry.

---

## Refresh Token Revocation

**The problem with plain JWTs:** A JWT remains cryptographically valid until its `exp` timestamp regardless of what the server knows. A user who logs out still has a valid refresh token for up to 7 days.

**Solution — server-side hash storage:**

```sql
-- Added by migration 002
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT,        -- SHA-256 hex of the current valid token
    ADD COLUMN IF NOT EXISTS refresh_token_exp  TIMESTAMPTZ; -- mirrors the JWT exp (double-check layer)
```

**Lifecycle:**

1. **Login / Register:** Backend generates a refresh token, computes `SHA-256(token)` as a hex string, stores it in `users.refresh_token_hash`, sets the `__Host-refresh` HttpOnly cookie in the response.
2. **`/api/auth/refresh`:** Backend reads the token from the `__Host-refresh` cookie (not the request body) → verifies JWT signature → checks `SHA-256(incoming token) == stored hash`. If the user has logged out, `stored_hash` is NULL → 401. Sets a new cookie with the rotated token.
3. **Rotation:** On every successful refresh, the old hash is replaced with the new token's hash atomically in the same `UPDATE`.
4. **Logout:** Backend reads the token from the cookie, sets `refresh_token_hash = NULL`, and clears the cookie (`MaxAge: -1`). Any subsequent refresh attempt fails with 401.

**Why SHA-256 hash, not the raw token:** The hash is a one-way commitment. An attacker who reads the database cannot reconstruct the token.

**Partial index:**

```sql
CREATE INDEX IF NOT EXISTS idx_users_refresh_token_hash ON users(refresh_token_hash)
    WHERE refresh_token_hash IS NOT NULL;
```

The index covers only rows where a token exists. Logged-out users (NULL hash) are excluded, keeping the index small.

---

## Rate Limiting — Brute-Force Protection

Login and registration endpoints are wrapped with `rateLimitMiddleware` in `middleware.go`.

**Design:**

| Setting | Value |
|---------|-------|
| Window | 5 minutes (sliding) |
| Max attempts | 10 per IP per window |
| Response when exceeded | `429 Too Many Requests` |
| Key | Client IP — reads `X-Forwarded-For` (set by Caddy) first, falls back to `RemoteAddr` |
| Storage | In-memory `map[string]*ipEntry` guarded by `sync.Mutex` |
| Cleanup | Background goroutine runs every 10 minutes and deletes entries whose window has passed — prevents unbounded memory growth on free-tier |

**Why count all attempts, not just failures:** bcrypt makes each attempt ~100 ms. Counting only failures lets an attacker pipeline requests up to the limit before the counter triggers. Counting every request ensures the window applies from the first attempt.

**Routes protected:**
```
POST /api/auth/login     ← rate limited
POST /api/auth/register  ← rate limited
POST /api/auth/refresh   ← not limited (token already required; cookie prevents replay)
POST /api/auth/logout    ← not limited
```

---

## React + TypeScript + Vite — Frontend

**Why React:** React's component model maps cleanly to the tab-based UI. Unidirectional data flow—state lives in `Dashboard.tsx` and flows down as props.

**Why TypeScript:** Interfaces (`Expense`, `Category`, `ExpenseActions`, etc.) are the contract between components. TypeScript enforces these at compile time.

**Why Vite over Create React App:** Vite's dev server is ~10× faster (native ESM, no full bundle in dev mode). CRA has been unmaintained since 2023.

**Frontend module structure:**

```
frontend/src/
├── main.tsx            — React root mount point
├── App.tsx             — session restore, auth gate, logout handler
├── AuthScreen.tsx      — login / register form
├── Dashboard.tsx       — owns all data + network; composes pure view components
├── api.ts              — HTTP: apiFetch, token storage, proactive + reactive refresh
├── types.ts            — TypeScript interfaces + action contracts + TABS order
├── hooks/
│   ├── useExpenseData.ts   — centralised data fetch: expenses, categories,
│   │                         availableYears, recurringItems, fetchCategoryPercent,
│   │                         fetchMonthlyTrend, fetchRecurring, fetchExport
│   └── useClickOutside.ts  — generic outside-click hook (used by dropdowns)
├── components/
│   └── SelectAllCheckbox.tsx — tri-state select-all checkbox (unchecked / indeterminate / checked)
└── views/
    ├── AddExpense.tsx      — form to add a new expense
    ├── Categories.tsx      — create, rename, delete categories; select-all bulk delete
    ├── ExpenseViewer.tsx   — filterable table with inline edit + bulk delete; select-all
    ├── DashboardView.tsx   — year/month filter, category breakdown bars, monthly trend chart, CSV export
    └── RecurringView.tsx   — recurring templates CRUD; select-all; dump to expenses with duplicate warning
```

**Component responsibilities:**

- `App.tsx` — restores session on mount: decodes user from the access token in `localStorage`; if expired, calls `attemptRefresh` which sends the HttpOnly cookie silently — no body needed. Registers the global session-expiry handler. Renders `AuthScreen` or `Dashboard`.
- `Dashboard.tsx` — the only component that calls `apiFetch` directly; owns `expenses`, `categories`, `recurringItems`, and action state; constructs typed action objects and passes them down as props.
- `useExpenseData` — centralises all read-only data fetching in one stable hook; computes `availableYears` via `useMemo`; exposes `fetchCategoryPercent`, `fetchMonthlyTrend`, `fetchRecurring` (lazy — triggered only when the Recurring tab is first opened), `fetchRecurringSummary` (fetches server-computed count + total for the Recurring tab bar, called in parallel with `fetchRecurring`), and `fetchExport` (CSV blob download) as stable `useCallback` references. Also owns `recurringSummary: RecurringSummary` state (`{ count, total }`) which is passed as a prop to `RecurringView`.
- View components under `views/` — pure UI, zero network dependency. They receive data and action interfaces as props.
- `SelectAllCheckbox` — single-responsibility reusable component; sets the native `indeterminate` DOM property via `useRef` + `useEffect` (not settable through JSX).

**Tab order (`types.ts`):**

```ts
export const TABS: TabName[] = ['dashboard', 'add', 'categories', 'viewer', 'recurring'];
```

Rendered as: **Overview → New Expense → Categories → My Expenses → Recurring**

**Dependency Inversion in views:** Views receive typed action interfaces (`ExpenseActions`, `CategoryActions`, `ExpenseViewerActions`, `RecurringActions`) as props, not concrete `apiFetch` calls. `DashboardView` receives `fetchCategoryPercent`, `fetchMonthlyTrend`, and `fetchExport` callbacks injected from `useExpenseData` — it never imports `apiFetch` directly.

**Interface Segregation in the Overview:** `DashboardView` receives `availableYears: string[]` (computed once in `useExpenseData`) rather than the full `Expense[]` array — it only needs the year strings, not the raw expense objects.

**Performance patterns used:**

| Pattern | Where | Why |
|---------|-------|-----|
| `useMemo` | `availableYears`, `trendMax`, `scopeLabel`, category stats, row styles | Avoids recomputing on every render |
| `useCallback([], [])` | Fetch callbacks, `selectAll`, `deselectAll`, `handleYearChange` | Stable references prevent unnecessary child re-renders |
| `Promise.all` | `DashboardView` load callback; Recurring tab lazy load | Parallel fetches in one round-trip |
| `useRef` + `useEffect` | `SelectAllCheckbox` | Native `indeterminate` property not settable via React props |
| Static style constants | All views | `STYLES` objects defined outside components; never recreated on render |

**Dev server proxy (`vite.config.ts`):**

```ts
server: {
    port: 5173,
    proxy: {
        '/api': {
            target: 'http://localhost:8080',
            changeOrigin: true,
            secure: false,
        }
    }
}
```

During local development (`npm run dev`), Vite proxies all `/api/*` requests to the Go backend running on port 8080.

---

## Tailwind CSS

Loaded via CDN script (`https://cdn.tailwindcss.com`) in `index.html`. Utility classes keep styles co-located with markup — no separate CSS files to maintain. No build step or PostCSS configuration required.

---

## Docker & Docker Compose

**Named volumes:**

| Volume | Purpose | Notes |
|--------|---------|-------|
| `pgdata` | Postgres data directory | Persists data across `docker compose down` |
| `caddy_data` | TLS certificates from Let's Encrypt | **Never wipe in production** |
| `caddy_config` | Caddy config cache | Safe to wipe; rebuilt on restart |

**`expose` vs `ports`:**

- `backend` and `frontend` use `expose` — ports are accessible only within the compose network.
- `caddy` uses `ports: ["80:80", "443:443", "443:443/udp"]` — the only container reachable from the host.

**Health check and startup ordering:**

```yaml
db:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
    interval: 5s
    timeout: 5s
    retries: 5

backend:
  depends_on:
    db:
      condition: service_healthy
```

Docker will not start the backend container until Postgres is actually accepting connections (not just started). This prevents migration failures on cold start.

---

## Caddy — Reverse Proxy & HTTPS

**Why Caddy over nginx as the TLS terminator:**

| Feature | Caddy | nginx |
|---------|-------|-------|
| TLS certificates | Automatic (Let's Encrypt, ACME v2) | Manual (`certbot` + cron renewal) |
| Localhost dev cert | Auto self-signed | Manual cert generation |
| HTTP/3 (QUIC) | Built-in (UDP 443) | Requires OpenSSL 3 + extra config |
| Config verbosity | ~15-line Caddyfile | 60+ line nginx.conf for equivalent |
| Zero-downtime renewal | Automatic | Cron job + nginx reload |

**Caddyfile:**

```
{$DOMAIN} {
    handle /api/* {
        reverse_proxy backend:8080
    }

    handle {
        reverse_proxy frontend:80
    }

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Frame-Options           "DENY"
        X-Content-Type-Options    "nosniff"
        Referrer-Policy           "strict-origin-when-cross-origin"
        -Server
    }

    log {
        output stdout
        format json
    }
}
```

**Security headers applied at the Caddy layer:**

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Forces HTTPS for 1 year |
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer leakage |
| `Server` | *(removed)* | Strips the server identification header |

---

## nginx — Frontend Static Server

The React build output (`dist/`) is served by nginx inside the `frontend` container. Key config:

- **SPA fallback:** `try_files $uri $uri/ /index.html` — all unmatched paths return `index.html` so client-side routing works.
- **Static asset caching:** `Cache-Control: public, max-age=31536000, immutable` on `/assets/*` — Vite content-hashes filenames so this is safe.
- **Gzip compression:** Text assets compressed, reducing transfer size by ~70%.

---

## Secret Management

| Variable | Type | How generated |
|----------|------|---------------|
| `POSTGRES_PASSWORD` | Secret | `openssl rand -hex 24` (192-bit entropy) |
| `JWT_SECRET` | Secret | `openssl rand -hex 64` (512-bit entropy) |
| `POSTGRES_USER` | Config | Manual in `.env` (default: `postgres`) |
| `POSTGRES_DB` | Config | Manual in `.env` (default: `financedb`) |
| `DOMAIN` | Config | Manual in `.env` (default: `localhost`) |
| `DB_URL` | Derived | Assembled at runtime in `start.sh` / `init-secrets.sh`; never written to `.env` |
| `ALLOWED_ORIGIN` | Derived | Built from `DOMAIN` at runtime; never written to `.env` |

**Idempotency:** `init-secrets.sh`'s `set_if_blank` function reads the current value of a key and only overwrites it if blank. Re-running the script on an existing `.env` is safe and preserves all values.

**`DB_URL` never in `.env`:** Assembling the connection string at runtime rather than storing it avoids accidentally committing credentials in a connection string form that includes both username and password.

---

## SOLID Architecture in the Frontend

| Principle | How it's applied |
|-----------|-----------------|
| **Single Responsibility** | Each file has one job: `api.ts` handles HTTP, `types.ts` holds interfaces, `useExpenseData.ts` owns all read fetches, `SelectAllCheckbox.tsx` handles only the tri-state visual + click dispatch, each view renders exactly one screen |
| **Open/Closed** | Adding a new tab requires creating a new file in `views/` and adding one line to `TABS` in `types.ts` — no existing view files change |
| **Liskov Substitution** | N/A — no class inheritance used |
| **Interface Segregation** | Each view gets only the action interface it needs (`ExpenseActions`, `CategoryActions`, `ExpenseViewerActions`, `RecurringActions`). `DashboardView` receives `availableYears: string[]` instead of the full `Expense[]` array — only the data it actually needs |
| **Dependency Inversion** | Views depend on typed action interfaces and injected fetch callbacks (abstractions), never on `apiFetch` (the concrete network implementation). `DashboardView` receives `fetchCategoryPercent`, `fetchMonthlyTrend`, and `fetchExport` as props from `Dashboard.tsx` via `useExpenseData`. `RecurringView` receives `RecurringActions` and a `summary: RecurringSummary` prop — no direct network calls |

---

## API Reference

All routes are prefixed `/api/`. Auth routes are public. All other routes require `Authorization: Bearer <access_token>`.

### Auth

| Method | Path | Request body | Success response |
|--------|------|-------------|-----------------|
| `POST` | `/api/auth/register` | `{ email, password }` | `201 { accessToken, refreshToken, user: { id, email } }` |
| `POST` | `/api/auth/login` | `{ email, password }` | `200 { accessToken, refreshToken, user: { id, email } }` |
| `POST` | `/api/auth/refresh` | `{ refreshToken }` | `200 { accessToken, refreshToken }` |
| `POST` | `/api/auth/logout` | `{ refreshToken }` | `204 (no body)` |

**Password rules:** minimum 6 characters, maximum 72 characters (bcrypt limit). Passwords are hashed at `bcrypt.DefaultCost` before storage.

### Categories *(auth required)*

| Method | Path | Query / body | Success response |
|--------|------|-------------|-----------------|
| `GET` | `/api/categories` | — | `200 [{ id, name }]` |
| `POST` | `/api/categories` | `{ name }` | `201 { id, name }` |
| `PUT` | `/api/categories` | `{ id, name }` | `200 { id, name }` |
| `DELETE` | `/api/categories/delete` | `?id=1&id=2` | `204` |

Category names are unique per user (`UNIQUE(name, user_id)` constraint). Deleting a category that has expenses attached returns `409 Conflict` (enforced by the `ON DELETE RESTRICT` foreign key).

### Expenses *(auth required)*

| Method | Path | Query / body | Success response |
|--------|------|-------------|-----------------|
| `GET` | `/api/expenses` | `?year=2024&month=11` (optional) | `200 [Expense]` |
| `POST` | `/api/expenses` | `{ amount, description, categoryId }` | `201 Expense` |
| `PUT` | `/api/expenses` | `{ id, amount, description, categoryId }` | `200 Expense` |
| `DELETE` | `/api/expenses/delete` | `?id=1&id=2` | `204` |
| `GET` | `/api/expenses/category-percentage` | `?year=2024&month=11` (optional) | `200 [{ categoryName, totalAmount, percentage }]` |
| `GET` | `/api/expenses/export` | `?from=2024-01-01&to=2024-12-31` (optional) | `200 CSV file download` |

The `year` and `month` query parameters are optional on `GET` endpoints. When omitted, results span all time. When provided, results are filtered to that calendar period.

The `from` / `to` parameters on `/api/expenses/export` are `YYYY-MM-DD` date strings. Both are optional; omitting them exports all expenses. The range is **inclusive** on both ends. The response sets `Content-Disposition: attachment; filename="expenses_YYYY-MM-DD_to_YYYY-MM-DD.csv"` to trigger a browser download.

**`Expense` object:**

```json
{
  "id": 42,
  "amount": 12.50,
  "description": "Lunch",
  "categoryId": 3,
  "categoryName": "Food & Dining",
  "createdAt": "2024-11-15T12:34:56Z"
}
```

### Reports *(auth required)*

| Method | Path | Query | Success response |
|--------|------|-------|-----------------|
| `GET` | `/api/reports/monthly` | `?year=2024&month=11` (optional) | `200 [{ month: "2024-11-01", totalAmount: 342.50 }]` ordered ASC by month |

`/api/reports/monthly` is used by the **Overview** tab to render the Monthly Trend bar chart. `year` and `month` filters narrow the result set using the same `buildFilter` helper as the expense endpoints. The `month` field is the ISO date of the first day of that calendar month (from PostgreSQL `date_trunc('month', created_at)`).

### Recurring Expenses *(auth required)*

| Method | Path | Query / body | Success response |
|--------|------|-------------|-----------------|
| `GET` | `/api/recurring` | — | `200 [RecurringExpense]` ordered by id ASC |
| `GET` | `/api/recurring/summary` | — | `200 { count: N, total: F }` |
| `POST` | `/api/recurring` | `{ amount, description, categoryId }` | `201 { id, amount, description, categoryId }` |
| `PUT` | `/api/recurring` | `?id=N` + `{ amount, description, categoryId }` | `200 { id, amount, description, categoryId }` |
| `DELETE` | `/api/recurring/delete` | `?id=1&id=2` | `204` |
| `POST` | `/api/recurring/dump` | `{ ids: [1,2,3], date: "2024-11-01" }` | `200 { added: N, warnings: [id, …] }` |

**`/api/recurring/summary`:** Returns the server-computed count and total monthly amount for all of the user's recurring templates. A single `SELECT COUNT(*), COALESCE(SUM(amount), 0)` query — no rows are transferred to the client just to sum them. `total` is `0.0` when the user has no templates. This endpoint is called in parallel with `GET /api/recurring` when the Recurring tab is first opened, and again after any CRUD operation that changes the template list.

**`RecurringExpense` object:**

```json
{
  "id": 7,
  "amount": 1200.00,
  "description": "Rent",
  "categoryId": 2,
  "categoryName": "Housing"
}
```

**`/api/recurring/dump`:** Inserts the selected recurring templates as real expenses on the given `date`. For each template, the handler checks whether an expense with the same `description`, `category_id`, and calendar month already exists for the user. Matching templates are still inserted; their IDs are returned in the `warnings` array so the client can surface a duplicate notice. `added` is the total number of rows inserted.

**`RecurringSummary` object:**

```json
{
  "count": 5,
  "total": 14200.00
}
```

---

## Database Schema

```sql
-- Migration 001: initial schema
CREATE TABLE users (
    id            SERIAL      PRIMARY KEY,
    email         TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,          -- bcrypt, DefaultCost
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE categories (
    id      SERIAL  PRIMARY KEY,
    name    TEXT    NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (name, user_id)
);

CREATE TABLE expenses (
    id          SERIAL         PRIMARY KEY,
    amount      NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    description TEXT,
    category_id INTEGER        NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    user_id     INTEGER        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_expenses_created_at  ON expenses(created_at);
CREATE INDEX idx_expenses_category_id ON expenses(category_id);
CREATE INDEX idx_expenses_user_id     ON expenses(user_id);
CREATE INDEX idx_categories_user_id   ON categories(user_id);

-- Migration 002: refresh token revocation
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT,
    ADD COLUMN IF NOT EXISTS refresh_token_exp  TIMESTAMPTZ;

CREATE INDEX idx_users_refresh_token_hash ON users(refresh_token_hash)
    WHERE refresh_token_hash IS NOT NULL;

-- Migration 003: recurring expense templates
CREATE TABLE recurring_expenses (
    id          SERIAL         PRIMARY KEY,
    amount      NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    description TEXT,
    category_id INTEGER        NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    user_id     INTEGER        NOT NULL REFERENCES users(id)     ON DELETE CASCADE
);

CREATE INDEX idx_recurring_user_id     ON recurring_expenses(user_id);
CREATE INDEX idx_recurring_category_id ON recurring_expenses(category_id);
```

**Design notes:**

- `amount NUMERIC(12,2)` — supports values up to 9,999,999,999.99 with exact decimal arithmetic.
- `category_id ... ON DELETE RESTRICT` — prevents deleting a category that has expenses (or recurring templates) attached. The UI enforces this as a user-facing error.
- `user_id ... ON DELETE CASCADE` on `categories`, `expenses`, and `recurring_expenses` — deleting a user cleans up all their data automatically.
- The partial index on `refresh_token_hash` excludes NULL rows (logged-out users) to keep the index small.
- `recurring_expenses` has no `created_at` column — templates are not time-stamped because they represent standing instructions, not events. The `dumpRecurring` handler uses the caller-supplied `date` when inserting into `expenses`.

---

## Data Flow Diagrams

### Registration / Login

```
Browser  →  POST /api/auth/login { email, password }
            credentials: 'same-origin'  ← browser will store the cookie from the response
         ←  200 { accessToken (15 min), user }
            Set-Cookie: __Host-refresh=<token>; HttpOnly; Secure; SameSite=Strict; Path=/; Expires=<7d>

Backend:
  1. SELECT user WHERE email = ?
  2. bcrypt.CompareHashAndPassword(stored_hash, incoming_password)
  3. issueTokenPair(userID, email):
       a. Sign access JWT  (type=access,  sub, email, exp=now+15m)
       b. Sign refresh JWT (type=refresh, sub, email, exp=now+7d)
       c. UPDATE users SET refresh_token_hash = SHA256(refreshToken),
                           refresh_token_exp  = now+7d
       d. Return accessToken, refreshToken, exp
  4. setRefreshCookie(w, refreshToken, exp)   ← HttpOnly cookie, never in JSON body
  5. jsonResponse { accessToken, user }

Browser stores accessToken in localStorage.
Refresh token is stored ONLY in the HttpOnly cookie — JS cannot read it.
```

### Authenticated Request with Proactive Refresh

```
apiFetch('/api/expenses'):
  1. Read accessToken from localStorage
  2. Decode JWT payload, check exp - 60s
     a. Not expired → add Authorization: Bearer header, send request
     b. Near/past expiry → POST /api/auth/refresh  (no body)
           credentials: 'same-origin' — browser sends __Host-refresh cookie automatically
        ← 200 { new accessToken }
           Set-Cookie: __Host-refresh=<new token>; HttpOnly; ...
        → saveAccessToken(newAccess), retry original request

On 401 from the API (reactive path):
  1. attemptRefresh() → new access token (cookie rotation happens server-side)
  2. Retry request once with new accessToken
  3. If refresh also fails → clearTokens(), call onSessionExpired()
     → App.tsx resets user state → AuthScreen shown
```

### Refresh Token Validation

```
POST /api/auth/refresh   (no JSON body — token arrives via HttpOnly cookie)

Backend:
  1. r.Cookie("__Host-refresh") → read token from cookie
     → cookie missing or empty → 401 Unauthorized
  2. jwt.ParseWithClaims → verify HS256 signature + expiry
  3. Assert claims["type"] == "refresh"
  4. SELECT refresh_token_hash, refresh_token_exp FROM users WHERE id = sub
  5. Compare SHA256(incoming) == stored_hash
     → mismatch or NULL → 401 Unauthorized
  6. Issue new token pair (issueTokenPair)
  7. UPDATE users SET refresh_token_hash = SHA256(newRefreshToken)
  8. setRefreshCookie(w, newRefreshToken, exp)   ← rotate the cookie
  9. Return { accessToken }   ← no refreshToken in JSON body
```

### Overview Dashboard Data Load

```
User navigates to Overview tab (or changes year/month filter):

DashboardView:
  1. Builds query params: ?year=YYYY (+ &month=MM if selected)
  2. Promise.all([
       fetchCategoryPercent(year, month),   → GET /api/expenses/category-percentage?...
       fetchMonthlyTrend(year, month),      → GET /api/reports/monthly?...
     ])
  3. Both resolve in parallel → setState for pctData + trendData
  4. React re-renders Category Breakdown bars + Monthly Trend chart simultaneously

Backend (getMonthlySummary):
  1. userID from JWT context
  2. buildFilter(r, "e", 2) → AND EXTRACT(YEAR FROM e.created_at) = $2 (etc.)
  3. SELECT date_trunc('month', e.created_at)::date AS month, SUM(e.amount)
     FROM expenses e WHERE e.user_id = $1 <filter> GROUP BY month ORDER BY month ASC
  4. Returns array ordered oldest → newest (for left-to-right chart rendering)
```

### Recurring Tab Load

```
User opens Recurring tab for the first time:

Dashboard useEffect (activeTab === 'recurring'):
  1. Promise.all([
       fetchRecurring(),         → GET /api/recurring
       fetchRecurringSummary(),  → GET /api/recurring/summary
     ])
  2. Both resolve in parallel (one network round-trip)
     → setRecurringItems(items)         — list state in useExpenseData
     → setRecurringSummary({ count, total }) — summary state in useExpenseData
  3. React re-renders RecurringView with updated items + summary prop

Backend (getRecurringSummary):
  1. userID from JWT context
  2. SELECT COUNT(*), COALESCE(SUM(amount), 0)
     FROM recurring_expenses WHERE user_id = $1
  3. Returns { count: N, total: F } — zero rows transferred for the total bar

RecurringView:
  - Grand total bar rendered from summary.count / summary.total (server data)
  - Selected total (checkbox state) computed client-side via useMemo
  - After any CRUD: onChanged() calls fetchRecurring() + fetchRecurringSummary()
    in parallel so bar and list stay in sync
```
