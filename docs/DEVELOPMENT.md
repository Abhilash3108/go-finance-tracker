# Developer Guide

> **Clone → configure → run in under 5 minutes.**

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Clone the Repository](#clone-the-repository)
3. [Configure Environment](#configure-environment)
4. [Run Locally](#run-locally)
5. [Verify Everything is Working](#verify-everything-is-working)
6. [Project Structure](#project-structure)
7. [Backend Development](#backend-development)
8. [Frontend Development](#frontend-development)
9. [Database Migrations](#database-migrations)
10. [Adding a New API Endpoint](#adding-a-new-api-endpoint)
11. [Adding a New Frontend View](#adding-a-new-frontend-view)
12. [Testing Views in Isolation](#testing-views-in-isolation)
13. [Resetting Everything](#resetting-everything)
14. [Deploying to Production](#deploying-to-production)
15. [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Tool | Minimum version | Check |
|------|----------------|-------|
| Docker | 24+ | `docker --version` |
| Docker Compose | v2 (bundled with Docker Desktop) | `docker compose version` |
| `openssl` | any | `openssl version` |
| `bash` | 4+ | `bash --version` |
| Git | any | `git --version` |

> **No Go or Node.js required on the host.** Both are installed inside Docker during the build.

---

## Clone the Repository

```bash
git clone https://github.com/your-org/go-finance-tracker.git
cd go-finance-tracker
```

---

## Configure Environment

```bash
cp .env.example .env
```

Open `.env` — the defaults work for local development without any changes:

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=        # left blank — auto-generated on first run
POSTGRES_DB=financedb
JWT_SECRET=               # left blank — auto-generated on first run
DOMAIN=localhost
```

> **You do not need to edit `.env` for local development.** `init-secrets.sh` fills in `POSTGRES_PASSWORD` and `JWT_SECRET` automatically on first run.

---

## Run Locally

```bash
chmod +x start.sh init-secrets.sh
./start.sh
```

What this does:

1. Runs `init-secrets.sh` — generates `POSTGRES_PASSWORD` (192-bit) and `JWT_SECRET` (512-bit) into `.env` if blank.
2. Derives `DB_URL` and `ALLOWED_ORIGIN` from the env values (never stored in `.env`).
3. Runs `docker compose up --build -d` with all secrets exported.

First run takes ~2–3 minutes (Docker pulls images + compiles Go). Subsequent starts take ~10 seconds.

```
✅  Generated POSTGRES_PASSWORD
✅  Generated JWT_SECRET
🔐  Secrets ready.
    DOMAIN         → localhost
    ALLOWED_ORIGIN → https://localhost
    DB_URL         → derived (not stored)

[+] Building ...
[+] Running 4/4
 ✔  finance_db       Running
 ✔  finance_backend  Running
 ✔  finance_frontend Running
 ✔  finance_caddy    Running
```

The app is available at **https://localhost**

> Your browser will show a certificate warning on localhost — Caddy issues a self-signed cert for local development. Click "Advanced → Proceed" (Chrome) or "Accept the Risk" (Firefox). This does not happen in production with a real domain.

---

## Verify Everything is Working

**1. Check all containers are healthy:**
```bash
docker compose ps
```
Expected: all four services in `running` state, `db` showing `(healthy)`.

**2. Ping the backend:**
```bash
curl -k https://localhost/api/auth/login \
  -X POST \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@test.com","password":"wrong"}' \
  -w '\nHTTP %{http_code}\n'
```
Expected: `HTTP 401` — server is up, credentials just don't exist yet.

**3. Check backend logs:**
```bash
docker compose logs backend --tail 20
```
Expected lines:
```
✅ Database migrated and connected
🚀 Backend listening on :8080
```

**4. Check migration state:**
```bash
docker compose exec db psql -U postgres -d financedb \
  -c "SELECT version, dirty FROM schema_migrations ORDER BY version;"
```
Expected:
```
 version | dirty
---------+-------
       1 | f
       2 | f
```

---

## Project Structure

```
go-finance-tracker/
│
├── start.sh              — start the app (generates secrets + docker compose up)
├── init-secrets.sh       — idempotent secret generator
├── .env                  — local config (gitignored)
├── .env.example          — template to copy
├── docker-compose.yml    — four-service orchestration
├── Caddyfile             — HTTPS reverse proxy config
│
├── docs/
│   ├── ARCHITECTURE.md   — technology decisions and system design
│   ├── DEVELOPMENT.md    — this file
│   └── USER_GUIDE.md     — end-user walkthrough
│
├── backend/
│   ├── main.go           — route registration, server start (~48 lines)
│   ├── models.go         — structs, constants, global vars
│   ├── db.go             — DB init, migrations, context/response helpers
│   ├── middleware.go     — CORS, JWT auth, key function
│   ├── auth.go           — register/login/refresh/logout handlers + token logic
│   ├── handlers.go       — categories, expenses, reports handlers
│   ├── go.mod / go.sum   — Go module definition
│   ├── Dockerfile
│   └── migrations/
│       ├── 001_init.sql           — users, categories, expenses schema
│       └── 002_refresh_token.sql  — adds refresh_token_hash column
│
└── frontend/
    ├── src/
    │   ├── main.tsx          — React entry point
    │   ├── App.tsx           — session restore + auth gate
    │   ├── AuthScreen.tsx    — login/register form
    │   ├── Dashboard.tsx     — data fetching, action wiring, tab layout
    │   ├── api.ts            — apiFetch, token storage, refresh logic
    │   ├── types.ts          — all TypeScript interfaces + action contracts
    │   └── views/            — pure UI components (no network code)
    │       ├── AddExpense.tsx
    │       ├── Categories.tsx
    │       ├── ExpenseViewer.tsx
    │       └── DashboardView.tsx
    ├── index.html
    ├── nginx.conf
    ├── tsconfig.json
    ├── vite.config.ts
    ├── package.json
    └── Dockerfile
```

---

## Backend Development

### Live reload during development

The Go binary runs inside Docker. For hot-reload, use [`air`](https://github.com/air-verse/air) or restart the backend container after changes:

```bash
docker compose restart backend
# or rebuild after a dependency change:
docker compose up --build backend -d
```

### Run backend tests

```bash
docker compose exec backend go test ./...
```

### Adding a package dependency

```bash
docker compose exec backend go get github.com/some/package
# Then rebuild:
docker compose up --build backend -d
```

### Inspect the database directly

```bash
docker compose exec db psql -U postgres -d financedb
```

Useful queries:
```sql
-- List all users
SELECT id, email, created_at FROM users;

-- See all expenses for a user
SELECT e.amount, e.description, c.name, e.created_at
FROM expenses e JOIN categories c ON e.category_id = c.id
WHERE e.user_id = 1;

-- Check refresh token state
SELECT id, email,
       CASE WHEN refresh_token_hash IS NOT NULL THEN 'logged in' ELSE 'logged out' END AS status
FROM users;
```

---

## Frontend Development

### Run frontend outside Docker (for fast iteration)

```bash
cd frontend
npm install
npm run dev   # starts Vite dev server at http://localhost:5173
```

The Vite dev server proxies `/api/*` to the backend. Add this to `vite.config.ts` if not present:

```ts
export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            '/api': 'https://localhost',
        },
    },
});
```

### Rebuild frontend container

```bash
docker compose up --build frontend -d
```

### TypeScript type checking

```bash
cd frontend
npx tsc --noEmit
```

> **Note:** IDE TypeScript errors like `Cannot find module 'react/jsx-runtime'` are false positives caused by `node_modules` not being installed on the host machine. They resolve after `npm install`. The Docker build always runs `npm install` so production builds are unaffected.

---

## Database Migrations

### Create a new migration

Create two files in `backend/migrations/` with the next sequence number:

```bash
# Example: adding a 'tags' table
touch backend/migrations/003_add_tags.sql
```

```sql
-- backend/migrations/003_add_tags.sql
CREATE TABLE IF NOT EXISTS tags (
    id      SERIAL  PRIMARY KEY,
    name    TEXT    NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (name, user_id)
);
```

`golang-migrate` detects and applies the new file automatically on the next backend start:
```bash
docker compose restart backend
# logs will show: ✅ Database migrated and connected
```

### Check migration status

```bash
docker compose exec db psql -U postgres -d financedb \
  -c "SELECT * FROM schema_migrations;"
```

### Roll back a migration (development only)

`golang-migrate` supports `.down.sql` files. For example:

```bash
# backend/migrations/003_add_tags.down.sql
DROP TABLE IF EXISTS tags;
```

Rolling back programmatically requires calling `m.Steps(-1)` instead of `m.Up()` in `db.go`. For production, prefer writing a new forward migration instead of rolling back.

---

## Adding a New API Endpoint

**Example: `GET /api/expenses/summary`**

**1. Add the handler in `backend/handlers.go`:**
```go
func getExpenseSummary(w http.ResponseWriter, r *http.Request) {
    userID := userIDFromContext(r)
    var total float64
    if err := db.QueryRow(
        "SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE user_id = $1", userID,
    ).Scan(&total); err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    jsonResponse(w, map[string]float64{"total": total}, http.StatusOK)
}
```

**2. Register the route in `backend/main.go`:**
```go
mux.Handle("/api/expenses/summary", auth(getExpenseSummary))
```

**3. Add the TypeScript type in `frontend/src/types.ts` (if needed):**
```ts
export interface ExpenseSummary { total: number; }
```

**4. Call it from `Dashboard.tsx`:**
```ts
const sumRes = await apiFetch('/api/expenses/summary');
if (sumRes.ok) setSummary(await sumRes.json());
```

**5. Rebuild:**
```bash
docker compose up --build backend -d
```

---

## Adding a New Frontend View

**Example: a "Budget" tab**

**1. Create `frontend/src/views/BudgetView.tsx`:**
```tsx
import type { BudgetActions } from '../types';

interface Props {
    actions: BudgetActions;
}

export default function BudgetView({ actions }: Props) {
    return <div>Budget view</div>;
}
```

**2. Add the action interface to `frontend/src/types.ts`:**
```ts
export interface BudgetActions {
    saveBudget: (amount: number) => Promise<boolean>;
}
```

**3. Add the tab name to `types.ts`:**
```ts
export type TabName = 'add' | 'categories' | 'viewer' | 'dashboard' | 'budget';
export const TABS: TabName[] = ['add', 'categories', 'viewer', 'dashboard', 'budget'];
```

**4. Wire it in `Dashboard.tsx`:**
```tsx
import BudgetView from './views/BudgetView';

// Inside the component, add the action implementation:
const budgetActions: BudgetActions = {
    saveBudget: async (amount) => {
        const res = await apiFetch('/api/budget', {
            method: 'POST',
            body: JSON.stringify({ amount }),
        });
        return res.ok;
    },
};

// In the JSX:
{activeTab === 'budget' && <BudgetView actions={budgetActions} />}
```

No other files need changing.

---

## Testing Views in Isolation

Views have no network dependency — they receive typed action interfaces as props. This makes unit testing straightforward.

**Install test dependencies:**
```bash
cd frontend
npm install -D vitest @testing-library/react @testing-library/user-event jsdom
```

**Example test for `AddExpense`:**
```ts
// frontend/src/views/__tests__/AddExpense.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import AddExpense from '../AddExpense';
import type { ExpenseActions } from '../../types';

const categories = [{ id: 1, name: 'Food' }];

describe('AddExpense', () => {
    it('calls addExpense with correct payload on submit', async () => {
        const mockActions: ExpenseActions = {
            addExpense: vi.fn().mockResolvedValue(true),
        };
        const onSaved = vi.fn();

        render(<AddExpense categories={categories} actions={mockActions} onSaved={onSaved} />);

        await userEvent.type(screen.getByPlaceholderText('Amount ($)'), '25.50');
        await userEvent.type(screen.getByPlaceholderText('Description'), 'Lunch');
        await userEvent.selectOptions(screen.getByRole('combobox'), '1');
        await userEvent.click(screen.getByText('Save Entry'));

        expect(mockActions.addExpense).toHaveBeenCalledWith({
            amount: 25.50,
            description: 'Lunch',
            categoryId: 1,
        });
        expect(onSaved).toHaveBeenCalled();
    });

    it('does not call onSaved when addExpense returns false', async () => {
        const mockActions: ExpenseActions = {
            addExpense: vi.fn().mockResolvedValue(false),
        };
        const onSaved = vi.fn();
        // ...
        expect(onSaved).not.toHaveBeenCalled();
    });
});
```

**Add to `vite.config.ts`:**
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
    },
});
```

**Run tests:**
```bash
cd frontend && npx vitest
```

---

## Resetting Everything

**Stop containers:**
```bash
docker compose down
```

**Full reset — wipes all data, volumes, and secrets:**
```bash
./start.sh --reset
```

This:
1. Runs `docker compose down -v` (deletes `pgdata`, `caddy_data`, `caddy_config`)
2. Clears `POSTGRES_PASSWORD` and `JWT_SECRET` in `.env`
3. Regenerates fresh secrets
4. Starts fresh

> ⚠️ All database records are permanently deleted. Use only in development.

---

## Deploying to Production

**1. Provision a server** with Docker installed (Ubuntu 22.04 LTS recommended).

**2. Point DNS:** Create an `A` record for `yourdomain.com` pointing to the server's IP. Caddy needs DNS propagated to obtain a Let's Encrypt certificate.

**3. Clone and configure:**
```bash
git clone https://github.com/your-org/go-finance-tracker.git
cd go-finance-tracker
cp .env.example .env
```

Edit `.env` — set only `DOMAIN`:
```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=        # leave blank
POSTGRES_DB=financedb
JWT_SECRET=               # leave blank
DOMAIN=yourdomain.com     # ← only line you need to change
```

**4. Start:**
```bash
chmod +x start.sh init-secrets.sh
./start.sh
```

Caddy automatically:
- Obtains a Let's Encrypt TLS certificate for `yourdomain.com`
- Configures HTTP → HTTPS redirect
- Enables HTTP/3 (QUIC) on UDP 443

**5. Verify:**
```bash
curl https://yourdomain.com/api/auth/login \
  -X POST -H 'Content-Type: application/json' \
  -d '{"email":"a","password":"b"}' -w '\nHTTP %{http_code}\n'
# Expected: HTTP 401
```

**Firewall:** Open ports `80` (ACME challenge) and `443` (HTTPS/QUIC). Block `8080` and `5432` — they are Docker-internal and should never be reachable from outside.

**Backups:**
```bash
# Dump the database
docker compose exec db pg_dump -U postgres financedb > backup_$(date +%Y%m%d).sql

# Restore
cat backup_20241201.sql | docker compose exec -T db psql -U postgres financedb
```

---

## Troubleshooting

### Backend exits immediately on start

```bash
docker compose logs backend
```

Common causes:
- `DB_URL not set` — run `./start.sh`, not `docker compose up` directly
- `Database unreachable` — Postgres health check failed. Wait 10s and retry, or check `docker compose logs db`

### "Certificate error" in browser

Expected on `localhost`. Click "Advanced → Proceed". For a real domain, wait for DNS propagation (up to 48h) then restart Caddy:
```bash
docker compose restart caddy
```

### Port 80 or 443 already in use

```bash
sudo lsof -i :80
sudo lsof -i :443
```
Stop the conflicting service (common culprit: a local Apache or nginx) then run `./start.sh` again.

### Migrations stuck in `dirty` state

A migration failed partway through. Fix the SQL, then:
```bash
docker compose exec db psql -U postgres -d financedb \
  -c "UPDATE schema_migrations SET dirty = false WHERE version = 2;"
docker compose restart backend
```

### Frontend shows blank page after deploy

The React build may be stale. Force a frontend rebuild:
```bash
docker compose up --build frontend -d
```

### Check all container logs at once

```bash
docker compose logs --tail 50 --follow
```
