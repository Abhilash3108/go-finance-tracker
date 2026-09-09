#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# start.sh — One command to run the whole app.
#
# First run:   ./start.sh          → generates secrets, builds, starts
# Subsequent:  ./start.sh          → secrets already set, starts normally
# Fresh reset: ./start.sh --reset  → wipes DB + certs, regenerates secrets
# Detached:    ./start.sh -d       → runs in background
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- Optional reset ---
if [[ "${1:-}" == "--reset" ]]; then
    echo "⚠️   Resetting volumes and regenerating secrets..."
    docker compose -f "$SCRIPT_DIR/docker-compose.yml" down -v 2>/dev/null || true
    sed -i.bak \
        -e 's|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=|' \
        -e 's|^JWT_SECRET=.*|JWT_SECRET=|' \
        "$SCRIPT_DIR/.env" && rm -f "$SCRIPT_DIR/.env.bak"
    echo "🗑️   Volumes wiped and secrets cleared."
    shift  # remove --reset so remaining args pass through to docker compose
fi

# --- Generate secrets (runs in a subshell — its set -e cannot kill us) ---
# init-secrets.sh writes values into .env when slots are blank.
# Running it as `bash script` (not `source`) isolates its shell options.
bash "$SCRIPT_DIR/init-secrets.sh" || {
    echo "❌  init-secrets.sh failed — check .env"
    exit 1
}

# --- Load .env values into this shell ---
# eval+grep is simpler than source because .env may have comments.
# `|| true` prevents grep exit-code 1 (empty file / no matches) from
# triggering our own set -e.
eval "$(grep -E '^[A-Z_]+=\S' "$SCRIPT_DIR/.env" | sed 's/[[:space:]]*#.*//' || true)"
export POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB JWT_SECRET DOMAIN

# --- Derive runtime vars (same logic as init-secrets.sh) ---
export DB_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}?sslmode=disable"
if [[ "${DOMAIN}" == "localhost" ]]; then
    export ALLOWED_ORIGIN="https://localhost"
else
    export ALLOWED_ORIGIN="https://${DOMAIN}"
fi

echo ""
echo "🚀  Starting Finance Tracker on https://${DOMAIN} ..."
echo "    ALLOWED_ORIGIN → ${ALLOWED_ORIGIN}"
echo "    DB_URL         → derived (not stored)"
echo ""

# --- Force a clean rebuild of the backend every time ---
# --no-cache ensures go mod tidy + go build always run fresh,
# preventing stale cached layers from serving an old binary.
DB_URL="$DB_URL" \
ALLOWED_ORIGIN="$ALLOWED_ORIGIN" \
docker compose -f "$SCRIPT_DIR/docker-compose.yml" build --no-cache backend

# --- Start all services (frontend + db + caddy use normal cache) ---
DB_URL="$DB_URL" \
ALLOWED_ORIGIN="$ALLOWED_ORIGIN" \
docker compose -f "$SCRIPT_DIR/docker-compose.yml" up --build "$@"