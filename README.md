# Finance Tracker

Personal expense tracker — record, categorise, and analyse your spending.

**Stack:** Go 1.21 · PostgreSQL 15 · React 18 + TypeScript 5 · Vite 5

---

## Quick start (local)

```bash
cp .env.example .env
./start.sh          # generates secrets, builds images, starts everything
```

Open **https://localhost** (accept the self-signed cert warning).

---

## Features

| Tab | What it does |
|-----|-------------|
| 📊 Overview | Category breakdown + monthly trend chart + CSV export |
| ➕ New Expense | Log a single expense |
| 🏷️ Categories | Create / rename / delete categories |
| 📋 My Expenses | Filter, inline-edit, bulk-delete |
| 🔁 Recurring | Monthly templates → dump to expenses in one click |
| 🔍 Spending | Multi-category comparison: monthly bars + all-time totals + saved groups (synced across devices) |

**Security highlights**
- 15-min access token (localStorage) + 7-day refresh token (`__Host-refresh` HttpOnly cookie)
- Rate-limited login/register: 10 attempts / 5 min per IP → `429`
- Refresh token revocation via server-side SHA-256 hash

---

## Docs

| File | Contents |
|------|----------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Tech choices, auth design, API reference, DB schema |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Setup, commands, patterns, adding endpoints/tabs |
| [USER_GUIDE.md](docs/USER_GUIDE.md) | How to use every feature |

---

## Environment variables

| Variable | Default | Notes |
|----------|---------|-------|
| `POSTGRES_USER` | `postgres` | |
| `POSTGRES_PASSWORD` | *(auto)* | 192-bit hex, generated on first run |
| `POSTGRES_DB` | `financedb` | |
| `JWT_SECRET` | *(auto)* | 512-bit hex, generated on first run |
| `DOMAIN` | `localhost` | Change for production |

`DB_URL` and `ALLOWED_ORIGIN` are assembled at runtime — never written to `.env`.

---

```bash
./start.sh --reset   # ⚠️ wipes all data — never run in production
```
