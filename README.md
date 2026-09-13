# Finance Tracker

A self-hosted personal finance tracker. Record expenses, organise by category, and analyse spending — fully containerised, HTTPS out of the box.

**Stack:** Go 1.21 · PostgreSQL 15 · React 18 + TypeScript 5 · Vite 5 · Docker · Caddy 2

---

## Quick Start

```bash
git clone https://github.com/your-org/go-finance-tracker.git
cd go-finance-tracker
cp .env.example .env        # only change DOMAIN= for production
./start.sh                  # generates secrets, builds images, starts all services
```

Open **https://localhost** — Caddy handles TLS automatically (self-signed cert on localhost).

---

## Documentation

| Doc | Audience | Contents |
|-----|----------|----------|
| [**ARCHITECTURE.md**](docs/ARCHITECTURE.md) | Engineers, tech leads | Technology choices, JWT token design, refresh token revocation, full API reference, database schema, data-flow diagrams |
| [**DEVELOPMENT.md**](docs/DEVELOPMENT.md) | Contributors | Clone → run → develop: env setup, migrations, adding endpoints, adding views, testing, production deploy, troubleshooting |
| [**USER_GUIDE.md**](docs/USER_GUIDE.md) | End users | Registration, login, categories, adding expenses, filtering, dashboard, FAQ |

---

## Architecture Overview

```
Browser
  │
  ▼
Caddy (:443 / :80)       ← only public-facing ports
  ├── /api/*  ──────────► Go backend (:8080, internal)
  │                           │
  │                           ▼
  │                       PostgreSQL (:5432, internal)
  │
  └── /*  ───────────────► nginx + React SPA (:80, internal)
```

Only Caddy's ports 80 and 443 are exposed to the host. Backend and database ports use Docker `expose` (container-internal only).

| Service | Image | Role |
|---------|-------|------|
| `caddy` | `caddy:2-alpine` | HTTPS/HTTP termination, reverse proxy, automatic TLS (Let's Encrypt / self-signed) |
| `backend` | built from `./backend` | REST API, JWT auth, DB migrations |
| `frontend` | built from `./frontend` | React SPA served by nginx |
| `db` | `postgres:15-alpine` | Persistent relational data store |

---

## Features

- **JWT authentication** — 15-minute access tokens + 7-day refresh tokens with automatic rotation
- **Refresh token revocation** — server-side SHA-256 hash stored in Postgres; logout invalidates immediately
- **Per-user data isolation** — every query is filtered by `user_id` extracted from the verified JWT
- **Automatic HTTPS** — Caddy + Let's Encrypt on a real domain; self-signed on localhost, no manual cert work
- **Schema migrations** — numbered `.up.sql` files run by `golang-migrate` at startup; safe to re-deploy
- **Zero hardcoded secrets** — `openssl rand` generates `POSTGRES_PASSWORD` (192-bit) and `JWT_SECRET` (512-bit) on first run
- **HTTP/3 (QUIC)** — Caddy's UDP port 443 entry enables HTTP/3 automatically
- **Security headers** — HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` applied at the Caddy layer
- **Overview dashboard** — year/month filter, category breakdown with percentage bars, monthly trend bar chart, peak month callout
- **CSV export** — download all expenses (or a specific date range) as a CSV file directly from the Overview tab
- **Recurring expenses** — store monthly templates (rent, subscriptions, etc.); dump selected templates into real expenses with one click, with same-month duplicate warnings; server-computed grand total bar shows total monthly commitment and selected subtotal at a glance
- **Bulk operations** — select-all checkbox in Categories, My Expenses, and Recurring tabs for one-click multi-delete
- **Friendly tab navigation** — Overview · New Expense · Categories · My Expenses · Recurring

---

## Environment Variables

Copy `.env.example` to `.env`. For local development the defaults need no changes:

| Variable | Default | Notes |
|----------|---------|-------|
| `POSTGRES_USER` | `postgres` | Database username |
| `POSTGRES_PASSWORD` | *(blank)* | Auto-generated (192-bit hex) on first run |
| `POSTGRES_DB` | `financedb` | Database name |
| `JWT_SECRET` | *(blank)* | Auto-generated (512-bit hex) on first run |
| `DOMAIN` | `localhost` | Change to your domain in production |
| `DB_URL` | *(derived)* | Built at runtime; never written to `.env` |
| `ALLOWED_ORIGIN` | *(derived)* | Built from `DOMAIN`; never written to `.env` |

---

## Resetting

```bash
./start.sh --reset    # wipes all volumes + secrets, starts fresh
```

This deletes `pgdata`, `caddy_data`, and `caddy_config` volumes, clears the generated secrets in `.env`, then regenerates everything and starts clean.

> ⚠️ **Never run `--reset` on a production server** — it permanently deletes all data and TLS certificates.
