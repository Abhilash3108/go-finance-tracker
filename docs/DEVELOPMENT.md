# Development Guide

## Prerequisites

- Docker + Docker Compose v2
- `openssl` (for secret generation)
- Node.js 20+ (for local frontend dev only)

---

## Quick start

```bash
cp .env.example .env
./start.sh             # builds images, generates secrets, starts all services
```

Frontend hot-reload (no Docker):
```bash
cd frontend && npm install && npm run dev   # proxies /api → localhost:8080
```

---

## Project structure

```
backend/
  main.go · handlers.go · auth.go · db.go · middleware.go · models.go
  migrations/  001_init · 002_refresh_token · 003_recurring_expenses

frontend/src/
  App.tsx · AuthScreen.tsx · Dashboard.tsx · api.ts · types.ts
  hooks/   useExpenseData.ts · useClickOutside.ts
  components/  SelectAllCheckbox.tsx
  views/   DashboardView · AddExpense · Categories · ExpenseViewer
           RecurringView · SpendingView
```

---

## Useful commands

```bash
# Backend
docker compose up --build backend -d
docker compose logs backend -f
docker compose exec db psql -U postgres -d financedb

# Frontend
cd frontend && npx tsc --noEmit     # type-check
docker compose up --build frontend -d

# All
docker compose ps
docker compose logs --tail 50 -f
```

---

## Key patterns

**Token storage**
- Access token → `localStorage` (15 min). Decoded on startup to restore user without a round-trip.
- Refresh token → `__Host-refresh` HttpOnly cookie. Never in JS. Browser sends it automatically on `POST /api/auth/refresh`.

**Rate limiting**
`rateLimitMiddleware` wraps `/api/auth/login` and `/api/auth/register`: 10 req / IP / 5 min → `429`.

**Data fetching**
Views never import `apiFetch`. All fetch callbacks come from `useExpenseData` and are injected via props — easy to mock in tests.

**`useExpenseData` exports**
`expenses · categories · availableYears · recurringItems · recurringSummary`  
`fetchData · fetchRecurring · fetchRecurringSummary · fetchCategoryPercent · fetchMonthlyTrend · fetchCategoryBreakdown · fetchExport`

**SpendingView-specific patterns**
- `actionsRef` — store the injected actions object in a ref so `doFetch` has an empty dep array without going stale.
- Debounce custom date input 600 ms before firing fetch.
- Guard: `if (ids.size === 0) { setBreakdown([]); return; }` — no fetch on empty selection.

---

## Adding a backend endpoint

1. Write handler in `handlers.go` — call `userIDFromContext(r)`, respond with `jsonResponse`.
2. Register route in `main.go` — `mux.Handle("/api/...", auth(myHandler))`.
3. Add response type to `types.ts`.
4. Add `useCallback` in `useExpenseData.ts` and include it in the return value.
5. Wire as prop in `Dashboard.tsx`.

## Adding a tab

1. Create `views/MyView.tsx` — typed `Props`, no `apiFetch` import.
2. Add action interface to `types.ts`.
3. Add `'mytab'` to `TabName` and `TABS` in `types.ts`.
4. Add icon + label to `TAB_ICONS` / `TAB_LABELS` in `Dashboard.tsx`.
5. Add `useMemo` action object + render line in `Dashboard.tsx`.

---

## Database migrations

```bash
# Create
touch backend/migrations/004_my_change.up.sql

# Apply (runs automatically on next backend start)
docker compose up --build backend -d

# Check state
docker compose exec db psql -U postgres -d financedb \
  -c "SELECT version, dirty FROM schema_migrations;"

# Fix dirty migration
UPDATE schema_migrations SET dirty = false WHERE version = N;
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `DB_URL not set` | Use `./start.sh`, not `docker compose up` directly |
| `dirty database version` | See migration section above |
| Session lost after deploy | `__Host-refresh` cookie requires HTTPS — ensure you're on `https://` |
| Refresh 401 | All `fetch` calls must include `credentials: 'same-origin'` |
| `429` on login | Rate limit hit — wait 5 min, or restart backend to reset in-memory counter |
| TypeScript errors | `cd frontend && npx tsc --noEmit` |
