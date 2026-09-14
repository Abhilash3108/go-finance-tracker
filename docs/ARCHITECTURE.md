# Architecture

## Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend | Go 1.21, `net/http` | Single binary, low RAM, fast cold start |
| Database | PostgreSQL 15 | `NUMERIC` for exact money, FK constraints, ACID |
| Migrations | `golang-migrate` | Numbered SQL files, tracked in `schema_migrations` |
| Frontend | React 18 + TypeScript 5 + Vite 5 | Type-safe, fast dev server |
| Styling | Tailwind CSS (CDN) | No build step |
| Production | Vercel (frontend) + Render (backend) | Free tier, zero-ops |

---

## Auth flow

**Two tokens:**

| Token | TTL | Storage |
|-------|-----|---------|
| Access token | 15 min | `localStorage` |
| Refresh token | 7 days | `__Host-refresh` HttpOnly cookie — JS cannot read it |

**Login/register** → server returns `{ accessToken, user }` + sets cookie.  
**Every `apiFetch`** → checks access token expiry; if within 60 s, silently refreshes first (`POST /api/auth/refresh`, no body — cookie sent automatically).  
**Refresh** → validates cookie against SHA-256 hash stored in DB, rotates token, sets new cookie.  
**Logout** → server nulls the DB hash + clears cookie.

**Cookie attributes:** `HttpOnly; Secure; SameSite=Lax; Path=/`  
`Lax` (not `Strict`) so the cookie is sent when the user reopens the app from a bookmark or new tab.

**Rate limiting:** `POST /api/auth/login` and `/register` — 10 attempts / IP / 5 min → `429`. Counter is in-memory, cleaned every 10 min.

---

## SOLID patterns

### Backend

| Principle | How |
|-----------|-----|
| Single Responsibility | `main.go` = routes only · `handlers.go` = business logic · `auth.go` = auth only · `middleware.go` = cross-cutting concerns · `models.go` = types + constants |
| Open/Closed | New endpoint = new handler function + one `mux.Handle` line — no existing handlers change |
| Interface Segregation | `authMiddleware` exposes only `userID` to handlers via context; handlers never touch the raw JWT or cookie |
| Dependency Inversion | Handlers receive `*sql.DB` via a package-level variable set in `db.go`; the DB abstraction (`sql.DB`) is the standard library interface, not a concrete driver |

### Frontend

| Principle | How |
|-----------|-----|
| Single Responsibility | `api.ts` = HTTP only · `types.ts` = interfaces only · each view = one screen |
| Open/Closed | New tab = new file in `views/` + one line in `TABS` — no existing files change |
| Interface Segregation | Each view gets only the action interface it needs (`ExpenseActions`, `RecurringActions`, `SpendingActions`, …) |
| Dependency Inversion | Views never import `apiFetch`; fetch callbacks are injected as props from `Dashboard.tsx` via `useExpenseData` |

**Frontend performance:** `useMemo` for derived data, `useCallback` for stable fetch references, `Promise.all` for parallel fetches, static `STYLES` objects defined outside components.

---

## File map

```
backend/
  main.go        — routes
  handlers.go    — categories, expenses, reports, recurring, spending
  auth.go        — register / login / refresh / logout + cookie helpers
  db.go          — connection pool + migration runner
  middleware.go  — CORS · JWT auth · rate limiter
  models.go      — domain structs + token TTL constants
  migrations/    — 001_init · 002_refresh_token · 003_recurring_expenses · 004_spending_groups

frontend/src/
  App.tsx              — session restore, auth gate
  AuthScreen.tsx       — login / register form
  Dashboard.tsx        — tab shell, data owner, action wiring
  api.ts               — apiFetch, token storage, proactive refresh
  types.ts             — interfaces, action contracts, TABS
  hooks/
    useExpenseData.ts  — all read fetches: expenses, categories,
                         recurringItems, recurringSummary,
                         fetchCategoryBreakdown, fetchGroups,
                         saveGroup, deleteGroup, fetchExport, …
    useClickOutside.ts
  components/
    SelectAllCheckbox.tsx
  views/
    DashboardView.tsx  — overview charts + CSV export
    AddExpense.tsx
    Categories.tsx
    ExpenseViewer.tsx
    RecurringView.tsx
    SpendingView.tsx   — category multi-select, date range, monthly bars
```

---

## API reference

### Auth (public)

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/api/auth/register` | `{ email, password }` | `201 { accessToken, user }` + cookie |
| POST | `/api/auth/login` | `{ email, password }` | `200 { accessToken, user }` + cookie |
| POST | `/api/auth/refresh` | *(none — cookie)* | `200 { accessToken }` + new cookie |
| POST | `/api/auth/logout` | *(none — cookie)* | `204` |

### Categories *(Bearer required)*

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/categories` | |
| POST | `/api/categories` | `{ name }` |
| PUT | `/api/categories?id=N` | `{ name }` |
| DELETE | `/api/categories/delete?id=1&id=2` | Fails `409` if expenses attached |

### Expenses *(Bearer required)*

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/expenses` | `?year=&month=` optional |
| POST | `/api/expenses` | `{ amount, description, categoryId }` |
| PUT | `/api/expenses?id=N` | same body |
| DELETE | `/api/expenses/delete?id=1&id=2` | |
| GET | `/api/expenses/category-percentage` | `?year=&month=` optional |
| GET | `/api/expenses/export` | `?from=YYYY-MM-DD&to=` → CSV download |

### Reports *(Bearer required)*

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/reports/monthly` | `?year=&month=` → `[{ month, totalAmount }]` |
| GET | `/api/reports/category-breakdown` | `?categories=1&categories=3&from=&to=` → `[CategoryBreakdown]` |

`category-breakdown` uses a window function to return per-month totals **and** all-time totals in one query:
```sql
SUM(SUM(e.amount)) OVER (PARTITION BY c.id) AS all_time_total
```

### Recurring *(Bearer required)*

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/recurring` | |
| GET | `/api/recurring/summary` | `{ count, total }` — server-computed |
| POST | `/api/recurring` | `{ amount, description, categoryId }` |
| PUT | `/api/recurring?id=N` | |
| DELETE | `/api/recurring/delete?id=1&id=2` | |
| POST | `/api/recurring/dump` | `{ ids, date }` → `{ added, warnings }` |

### Spending Groups *(Bearer required)*

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/spending-groups` | `[{ id, name, categoryIds }]` — per user |
| POST | `/api/spending-groups` | `{ name, categoryIds }` → `201 { id, name, categoryIds }` |
| DELETE | `/api/spending-groups/delete?id=N` | `204` |

Groups are stored in DB per user — available on every device after login. `categoryIds` is a PostgreSQL `integer[]` column, encoded/decoded without extra dependencies via `intArrayValue` / `intArrayScanner` helpers in `handlers.go`.

---

## Database schema

```sql
-- 001
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,        -- bcrypt
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE categories (
    id      SERIAL PRIMARY KEY,
    name    TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (name, user_id)
);

CREATE TABLE expenses (
    id          SERIAL PRIMARY KEY,
    amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    description TEXT,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 002
ALTER TABLE users
    ADD COLUMN refresh_token_hash TEXT,
    ADD COLUMN refresh_token_exp  TIMESTAMPTZ;

-- 003
CREATE TABLE recurring_expenses (
    id          SERIAL PRIMARY KEY,
    amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    description TEXT,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

-- 004
CREATE TABLE spending_groups (
    id           SERIAL    PRIMARY KEY,
    user_id      INTEGER   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT      NOT NULL,
    category_ids INTEGER[] NOT NULL DEFAULT '{}'
);
```
