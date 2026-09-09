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
14. [API Design](#api-design)
15. [Database Schema](#database-schema)
16. [Data Flow Diagram](#data-flow-diagram)

---

## System Overview

Finance Tracker is a self-hosted personal finance application. It is a four-service system:

```
Browser
  │
  ▼
Caddy (443 / HTTPS)          ← only public-facing port
  ├── /api/*  ──────────────► Go Backend (:8080, internal)
  │                               │
  │                               ▼
  │                           PostgreSQL (:5432, internal)
  │
  └── /*  ───────────────────► nginx serving React SPA (:80, internal)
```

Only Caddy is exposed to the internet. Backend and frontend ports are Docker-internal (`expose`, not `ports`), so they are unreachable directly.

---

## Go — Backend Language

**Choice:** Go 1.21, standard library `net/http`.

**Why Go:**

| Concern | Decision |
|---------|----------|
| Performance | Go compiles to a single static binary. Cold start in ~5 ms. The standard library HTTP server handles thousands of concurrent requests on minimal RAM — no separate application server (Gunicorn, uWSGI, Puma) needed. |
| Simplicity | The `net/http` package covers all routing needs for this API surface. No framework overhead, no dependency tree sprawl. |
| Type safety | Go's static types catch entire classes of bugs at compile time rather than at runtime. |
| Deployment | The binary + a minimal `alpine` base image produces a ~15 MB Docker image. |
| Concurrency | Goroutines and the net/http per-request handler model handle I/O-bound database calls without blocking. |

**Why not Node / Python / Java:**
- Node (Express): JavaScript's dynamic typing shifts bugs to runtime. Needs a process manager.
- Python (FastAPI/Django): Good ergonomics but ~3–5× more RAM for equivalent throughput.
- Java (Spring): Excellent but 300 MB+ JVM startup, large images, significant configuration.

**Dependencies (go.mod):**

```
github.com/golang-jwt/jwt/v5     v5.2.1   — JWT signing/parsing
github.com/golang-migrate/migrate/v4 v4.17.1 — SQL migration runner
github.com/lib/pq                v1.10.9  — PostgreSQL driver
golang.org/x/crypto              v0.22.0  — bcrypt password hashing
```

All are minimal, well-maintained libraries. The entire dependency tree is 7 packages — trivially auditable.

---

## PostgreSQL — Database

**Choice:** PostgreSQL 15 (Alpine image).

**Why PostgreSQL:**

| Concern | Decision |
|---------|----------|
| Data integrity | Foreign keys with `ON DELETE CASCADE` / `ON DELETE RESTRICT` enforce referential integrity at the DB level — not just in application code. |
| Numeric precision | `NUMERIC(12,2)` for `amount` avoids floating-point rounding errors that plague `FLOAT` or JavaScript numbers when dealing with money. |
| Timestamps | `TIMESTAMPTZ` stores timestamps with timezone offset. Queries across timezones stay correct without application-level conversion. |
| Constraints | `CHECK (amount > 0)` on expenses, `UNIQUE (name, user_id)` on categories — the DB enforces invariants even if application code has a bug. |
| ACID | Full transactional guarantees. A partial write never leaves the database in an inconsistent state. |
| Production-grade | PostgreSQL handles concurrency, vacuuming, WAL, and replication — the same engine used at companies running billions of rows. |

**Why not SQLite:**
SQLite is single-writer. As soon as two requests hit simultaneously — which happens on every page load with the parallel `Promise.all` in `Dashboard.tsx` — you get write contention. PostgreSQL handles concurrent connections properly.

**Why not MySQL/MariaDB:**
PostgreSQL's `TIMESTAMPTZ`, partial indexes, and `RETURNING` clause (used in all `INSERT` statements to get the new row ID in one round-trip) are cleaner than MySQL equivalents.

---

## golang-migrate — Schema Management

**Choice:** `golang-migrate/migrate/v4` with numbered `*.sql` files.

**Why numbered migrations instead of `CREATE TABLE IF NOT EXISTS` in `main.go`:**

| Problem with inline SQL | Solution |
|------------------------|----------|
| No history — you can't tell what changed between deploys | Each migration file is a permanent, ordered record of every schema change |
| Can't safely alter a production table | `ALTER TABLE` in migration 002 ran once on the live DB and never again |
| Can't roll back | Migrations can have `.up.sql` and `.down.sql` pairs |
| Can't collaborate | Team members apply the same numbered files in the same order |

**Migration files:**

```
backend/migrations/
├── 001_init.sql          — initial schema: users, categories, expenses
└── 002_refresh_token.sql — adds refresh_token_hash + refresh_token_exp to users
```

`golang-migrate` tracks which migrations have run in a `schema_migrations` table it manages automatically. Running `initDB()` on startup is idempotent — it applies any pending migrations and skips already-applied ones.

---

## JWT Authentication — Access & Refresh Tokens

**Why JWT over sessions:**
Sessions require server-side storage (Redis, DB table) that must be replicated across instances. JWTs are stateless — any backend instance can validate a token by verifying the HMAC signature with the shared `JWT_SECRET`. This matters for horizontal scaling.

**Two-token design:**

| Token | TTL | Purpose |
|-------|-----|---------|
| Access token | **15 minutes** | Sent in `Authorization: Bearer` header on every API call. Short TTL limits the window if intercepted. |
| Refresh token | **7 days** | Sent only to `/api/auth/refresh`. Exchanges for a new token pair without re-entering a password. |

**Claims structure:**

```json
// Access token payload
{
  "sub":  42,           // numeric user ID
  "type": "access",    // type guard — prevents refresh token being used as access
  "iat":  1700000000,
  "exp":  1700000900   // 15 min later
}

// Refresh token payload
{
  "sub":   42,
  "email": "user@example.com",  // carried so /refresh needs no DB lookup
  "type":  "refresh",
  "iat":   1700000000,
  "exp":   1700604800           // 7 days later
}
```

**`type` claim:** Both tokens are HMAC-SHA256 signed with the same secret. Without the `type` guard, a refresh token could be submitted to a protected API route and pass signature validation. The `parseAccessToken` and `parseRefreshToken` functions each assert `claims["type"]` before accepting a token.

**Signing algorithm:** `HS256` (HMAC-SHA256). Symmetric — the same secret signs and verifies. Appropriate for a single-server deployment. For multi-party systems (microservices, third-party clients), `RS256` (asymmetric) is preferred but adds key-pair management complexity that is unnecessary here.

**Client-side storage:** Tokens are stored in `localStorage` with keys `finance_access_token` and `finance_refresh_token`. The `api.ts` module wraps all token access in `try/catch` to handle browsers that block storage (private windows, strict cookie settings).

**Proactive refresh:** `apiFetch` checks expiry 60 seconds before the actual `exp` timestamp. This means the user never hits a 401 mid-operation because the token expired between the check and the server processing the request.

---

## Refresh Token Revocation

**The problem with plain JWTs:** A JWT is valid until its `exp` timestamp regardless of what the server knows. If a user logs out, the old token is still cryptographically valid for up to 7 days.

**Solution — server-side hash storage:**

```sql
-- users table (migration 002)
refresh_token_hash  TEXT        -- SHA-256 hex of the current valid refresh token
refresh_token_exp   TIMESTAMPTZ -- mirrors the JWT exp (double-check layer)
```

**How it works:**

1. **Login / Register:** Backend generates a refresh token, computes `SHA-256(token)`, stores the hash in `users.refresh_token_hash`.
2. **`/api/auth/refresh`:** Backend verifies JWT signature → then checks `SHA-256(incoming) == stored_hash`. If the user logged out on another device, `stored_hash` is NULL → 401.
3. **Rotation:** On every successful refresh, the old hash is replaced with the new token's hash atomically. Replaying an old refresh token after rotation returns 401 immediately.
4. **Logout:** Backend sets `refresh_token_hash = NULL`. Any subsequent refresh attempt fails the hash check — the token is revoked within milliseconds of logout.

**Why SHA-256 hash, not the raw token:**
Storing the raw token in the database means a DB read breach exposes valid bearer credentials. The hash is a one-way commitment — an attacker who reads the database cannot reconstruct the token.

**Why a partial index:**
```sql
CREATE INDEX idx_users_refresh_token_hash ON users(refresh_token_hash)
    WHERE refresh_token_hash IS NOT NULL;
```
The index only covers rows where a token exists. Logged-out users (NULL hash) are excluded, keeping the index small and lookups fast.

---

## React + TypeScript + Vite — Frontend

**Why React:**
React's component model maps cleanly to the tab-based UI (AddExpense, Categories, ExpenseViewer, DashboardView). Unidirectional data flow — state lives in `Dashboard.tsx`, flows down as props — makes data changes predictable.

**Why TypeScript:**
- Interfaces (`Expense`, `Category`, `ExpenseActions`) are the contract between components. TypeScript enforces these at compile time.
- The `actions` prop pattern — where views receive typed action interfaces instead of directly calling `apiFetch` — is only ergonomic with TypeScript. Without it, you'd pass untyped functions and lose all safety.
- Vite's build pipeline (`tsc -p tsconfig.json && vite build`) type-checks before bundling — no runtime surprises from a mismatched API response shape.

**Why Vite over Create React App:**
- Vite dev server is ~10× faster (native ESM, no bundling in dev)
- Build output is smaller (better tree-shaking)
- CRA is unmaintained as of 2023

**Frontend module structure:**

```
src/
├── main.tsx          — React root mount
├── App.tsx           — session restore, auth gate
├── AuthScreen.tsx    — login/register
├── Dashboard.tsx     — owns data + network; composes views
├── api.ts            — all HTTP: apiFetch, token storage, refresh logic
├── types.ts          — interfaces + action contracts
└── views/            — pure UI components, zero network dependency
    ├── AddExpense.tsx
    ├── Categories.tsx
    ├── ExpenseViewer.tsx
    └── DashboardView.tsx
```

**Dependency Inversion in views:** Views receive `actions: ExpenseActions` (etc.) as props — typed interfaces, not concrete `apiFetch` calls. This makes every view independently testable by passing a mock implementation:

```ts
const mockActions: ExpenseActions = {
    addExpense: vi.fn().mockResolvedValue(true),
};
render(<AddExpense categories={[]} actions={mockActions} onSaved={vi.fn()} />);
```

---

## Tailwind CSS

Loaded via CDN (`<script src="https://cdn.tailwindcss.com">`). Utility classes keep styles co-located with markup — no separate CSS files to maintain. For a project of this size, the CDN play-CDN script is acceptable. For production with strict CSP, the PostCSS CLI build pipeline would be preferred.

---

## Docker & Docker Compose

**Why Docker:**
- Reproducible builds — the Go binary is compiled inside `golang:1.21-alpine`, not on the host. A developer on macOS produces the same Linux binary as CI.
- Isolation — services communicate on a Docker internal network. Only Caddy has public ports.
- Dependency-free deploys — the production server needs only Docker and `git clone`.

**Multi-stage Dockerfile (backend):**

```dockerfile
# Stage 1: compile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o server .

# Stage 2: minimal runtime image
FROM alpine:3.19
COPY --from=builder /app/server .
COPY migrations/ ./migrations/
CMD ["./server"]
```

The final image contains only the compiled binary and migration SQL files. No Go toolchain. Result: ~15 MB image vs ~800 MB if built on `golang:1.21`.

**Named volumes:**

| Volume | Purpose | Notes |
|--------|---------|-------|
| `pgdata` | Postgres data directory | Persists data across `docker compose down` |
| `caddy_data` | TLS certificates from Let's Encrypt | **Never wipe in production** — rate limits on cert re-issuance |
| `caddy_config` | Caddy config cache | Safe to wipe; rebuilt on restart |

**`expose` vs `ports`:**
Backend (`:8080`) and frontend (`:80`) use `expose` — they are reachable only by other containers on the Docker network. `ports` maps a host port, making the service reachable from outside. Only Caddy uses `ports: ["80:80", "443:443"]`.

**Health check:**
```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
  interval: 5s
  retries: 5
```
The backend container has `depends_on: db: condition: service_healthy`. Docker will not start the backend until Postgres is actually accepting connections — not just started. Without this, the backend attempts its DB connection during Postgres initialization and crashes.

---

## Caddy — Reverse Proxy & HTTPS

**Why Caddy over nginx as the TLS terminator:**

| Feature | Caddy | nginx |
|---------|-------|-------|
| TLS certificates | Automatic (Let's Encrypt, ACME) | Manual (`certbot`, cron renewal) |
| HTTP/3 (QUIC) | Built-in | Requires OpenSSL 3 + extra config |
| Config verbosity | 10-line Caddyfile | 60+ line nginx.conf for equivalent |
| Localhost dev | Auto self-signed cert | Manual cert generation |
| Cert renewal | Zero-downtime automatic | Cron job + reload |

The entire production TLS config is:
```
{$DOMAIN} {
    handle /api/* { reverse_proxy backend:8080 }
    handle        { reverse_proxy frontend:80  }
}
```
Caddy reads `DOMAIN` from the environment and handles cert issuance, renewal, OCSP stapling, and HTTP→HTTPS redirect automatically.

**Security headers (Caddy layer):**

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Forces HTTPS for 1 year; eligible for browser HSTS preload list |
| `X-Frame-Options` | `DENY` | Prevents clickjacking (embedding the app in an iframe) |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing attacks |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer leakage to cross-origin requests |
| `-Server` | *(removed)* | Strips the `Caddy` server header — no version fingerprinting |

---

## nginx — Frontend Static Server

The React build output (`dist/`) is served by nginx inside the `frontend` container. Key config choices:

- **SPA fallback:** `try_files $uri $uri/ /index.html` — all unknown paths return `index.html` so React Router can handle client-side navigation.
- **Static asset caching:** `Cache-Control: public, max-age=31536000, immutable` on `/assets/*`. Vite content-hashes all asset filenames (`main.a3f9c2.js`) so stale cache is impossible.
- **Gzip compression:** Text assets (JS, CSS, HTML) are gzip-compressed, reducing transfer size by ~70%.
- **Proxy headers:** Forwards `X-Forwarded-For` and `X-Forwarded-Proto` so the backend can read the real client IP and protocol if needed.

---

## Secret Management

**What is secret vs. config:**

| Variable | Type | How set |
|----------|------|---------|
| `POSTGRES_PASSWORD` | Secret | Auto-generated: `openssl rand -hex 24` (192-bit) |
| `JWT_SECRET` | Secret | Auto-generated: `openssl rand -hex 64` (512-bit) |
| `POSTGRES_USER` | Config | Manual in `.env` (default: `postgres`) |
| `POSTGRES_DB` | Config | Manual in `.env` (default: `financedb`) |
| `DOMAIN` | Config | Manual in `.env` (default: `localhost`) |
| `DB_URL` | Derived | Built at runtime by `init-secrets.sh` — never stored |
| `ALLOWED_ORIGIN` | Derived | Built from `DOMAIN` at runtime — never stored |

**Why `openssl rand -hex`:**
- `openssl rand -hex 24` generates 24 random bytes from `/dev/urandom`, hex-encoded to 48 characters. Entropy: 192 bits. Brute-force infeasible.
- `openssl rand -hex 64` for JWT: 512 bits. HMAC-SHA256 only uses 256 bits of key material, so this is double the necessary entropy — fully future-proof.

**Idempotency:** `init-secrets.sh` only fills blank values. Re-running it on a server that already has secrets does nothing — existing values are preserved.

**`DB_URL` never in `.env`:** The connection string contains both the username and password. Storing it separately from its components would create a duplication/drift risk. Instead it is assembled at runtime and exported only into the Docker Compose environment.

---

## SOLID Architecture in the Frontend

| Principle | Applied |
|-----------|---------|
| **Single Responsibility** | Each file has one job: `api.ts` handles HTTP, `types.ts` holds interfaces, each view renders one screen |
| **Open/Closed** | Adding a new tab/view requires adding a file and one line in `Dashboard.tsx` — no existing files change |
| **Liskov Substitution** | N/A — no class inheritance in this codebase |
| **Interface Segregation** | Each view gets only the action interface it needs (`ExpenseActions`, `CategoryActions`, `ExpenseViewerActions`) |
| **Dependency Inversion** | Views depend on `ExpenseActions` (abstract interface), not `apiFetch` (concrete implementation). `Dashboard.tsx` wires the concrete implementation |

---

## API Design

All routes are prefixed `/api/`. Auth routes are public; data routes require `Authorization: Bearer <access_token>`.

### Auth

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/api/auth/register` | `{ email, password }` | `201 { accessToken, refreshToken, user }` |
| `POST` | `/api/auth/login` | `{ email, password }` | `200 { accessToken, refreshToken, user }` |
| `POST` | `/api/auth/refresh` | `{ refreshToken }` | `200 { accessToken, refreshToken }` |
| `POST` | `/api/auth/logout` | `{ refreshToken }` | `204` |

### Categories *(auth required)*

| Method | Path | Body | Response |
|--------|------|------|----------|
| `GET` | `/api/categories` | — | `200 [{ id, name }]` |
| `POST` | `/api/categories` | `{ name }` | `201 { id, name }` |
| `DELETE` | `/api/categories/delete?id=N` | — | `204` |

### Expenses *(auth required)*

| Method | Path | Query | Body | Response |
|--------|------|-------|------|----------|
| `GET` | `/api/expenses` | `year`, `month` | — | `200 [Expense]` |
| `POST` | `/api/expenses` | — | `{ amount, description, categoryId }` | `201 Expense` |
| `DELETE` | `/api/expenses/delete?id=N` | — | — | `204` |
| `GET` | `/api/expenses/category-percentage` | `year`, `month` | — | `200 [Result]` |

### Reports *(auth required)*

| Method | Path | Response |
|--------|------|----------|
| `GET` | `/api/reports/monthly` | `200 [{ month, totalAmount }]` |
| `GET` | `/api/reports/total` | `200 { total }` |
| `GET` | `/api/reports/category-totals` | `200 [{ categoryName, totalAmount }]` |

---

## Database Schema

```sql
users
├── id             SERIAL PRIMARY KEY
├── email          TEXT NOT NULL UNIQUE
├── password_hash  TEXT NOT NULL          -- bcrypt, DefaultCost
├── created_at     TIMESTAMPTZ DEFAULT NOW()
├── refresh_token_hash TEXT               -- SHA-256 hex; NULL = logged out
└── refresh_token_exp  TIMESTAMPTZ        -- mirrors JWT exp

categories
├── id       SERIAL PRIMARY KEY
├── name     TEXT NOT NULL
├── user_id  INTEGER → users(id) ON DELETE CASCADE
└── UNIQUE(name, user_id)                -- per-user uniqueness only

expenses
├── id           SERIAL PRIMARY KEY
├── amount       NUMERIC(12,2) CHECK (amount > 0)
├── description  TEXT
├── category_id  INTEGER → categories(id) ON DELETE RESTRICT
├── user_id      INTEGER → users(id) ON DELETE CASCADE
└── created_at   TIMESTAMPTZ DEFAULT NOW()

-- Indexes
idx_expenses_created_at   ON expenses(created_at)
idx_expenses_category_id  ON expenses(category_id)
idx_expenses_user_id      ON expenses(user_id)
idx_categories_user_id    ON categories(user_id)
idx_users_refresh_token_hash ON users(refresh_token_hash) WHERE hash IS NOT NULL
```

**Per-user data isolation:** Every query filters by `user_id = $1` injected from the validated JWT. A user cannot read or modify another user's data even if they guess an integer ID — the SQL `WHERE` clause enforces it.

---

## Data Flow Diagram

```
Registration / Login
─────────────────────────────────────────────────────────────────
Browser → POST /api/auth/login { email, password }
        ← 200 { accessToken (15 min), refreshToken (7 days), user }
Browser stores both tokens in localStorage

Authenticated Request
─────────────────────────────────────────────────────────────────
apiFetch checks: is accessToken expired? (60s before exp)
  No  → GET /api/expenses  Authorization: Bearer <accessToken>
  Yes → POST /api/auth/refresh { refreshToken }
        ← 200 { new accessToken, new refreshToken }  (rotation)
        → retry original request with new accessToken

Logout
─────────────────────────────────────────────────────────────────
Browser → POST /api/auth/logout { refreshToken }
        Backend: UPDATE users SET refresh_token_hash = NULL
        ← 204
Browser clears localStorage
Any future use of the old refreshToken → 401 (hash mismatch)
```
