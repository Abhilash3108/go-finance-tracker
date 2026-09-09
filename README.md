# Finance Tracker

A self-hosted personal finance tracker. Record expenses, organise by category, and analyse spending — fully containerised, HTTPS out of the box.

**Stack:** Go · PostgreSQL · React + TypeScript · Docker · Caddy

---

## Quick Start

```bash
git clone https://github.com/your-org/go-finance-tracker.git
cd go-finance-tracker
cp .env.example .env        # only change DOMAIN= for production
./start.sh                  # generates secrets, builds, starts all services
```

Open **https://localhost** — Caddy handles TLS automatically.

---

## Documentation

| Doc | Audience | Contents |
|-----|----------|----------|
| [**ARCHITECTURE.md**](docs/ARCHITECTURE.md) | Engineers, tech leads | Why every technology was chosen — Go, PostgreSQL, JWT token design, refresh token revocation, Caddy, Docker, SOLID architecture, full API reference, schema |
| [**DEVELOPMENT.md**](docs/DEVELOPMENT.md) | Contributors | Clone → run → develop: env setup, DB migrations, adding endpoints, adding views, testing, deploying to production, troubleshooting |
| [**USER_GUIDE.md**](docs/USER_GUIDE.md) | End users | Registration, login, categories, adding expenses, filtering, dashboard, FAQ |

---

## Services

```
Browser → Caddy (443) → Go backend (:8080, internal)
                    ↘ nginx/React (:80, internal)
                         ↓
                     PostgreSQL (:5432, internal)
```

| Service | Image | Role |
|---------|-------|------|
| `caddy` | `caddy:2-alpine` | HTTPS termination, reverse proxy, auto TLS |
| `backend` | built from `./backend` | REST API, JWT auth, migrations |
| `frontend` | built from `./frontend` | React SPA served by nginx |
| `db` | `postgres:15-alpine` | Persistent data store |

---

## Features

- **JWT auth** — 15-minute access tokens + 7-day refresh tokens with rotation
- **Refresh token revocation** — server-side SHA-256 hash; logout invalidates immediately
- **Per-user isolation** — all queries filtered by `user_id` from the JWT
- **Automatic HTTPS** — Caddy + Let's Encrypt; works on localhost too (self-signed)
- **Schema migrations** — numbered SQL files via `golang-migrate`; safe to re-deploy
- **Zero hardcoded secrets** — `openssl rand` generates credentials on first run

---

## Resetting

```bash
./start.sh --reset    # wipes all volumes + secrets, starts fresh
```
