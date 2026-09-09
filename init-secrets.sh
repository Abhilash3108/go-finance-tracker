#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# init-secrets.sh — Generate secrets and derive runtime vars from .env.
#
# Called automatically by start.sh. Safe to run repeatedly (idempotent):
# it only fills in BLANK values, never overwrites existing ones.
# ---------------------------------------------------------------------------
set -euo pipefail

ENV_FILE="$(dirname "$0")/.env"

if [[ ! -f "$ENV_FILE" ]]; then
    echo "❌  .env not found. Run: cp .env.example .env"
    exit 1
fi

# ---------------------------------------------------------------------------
# Helper: write KEY=VALUE into .env only when the current value is blank.
# ---------------------------------------------------------------------------
set_if_blank() {
    local key="$1"
    local value="$2"

    local current
    current=$(grep -E "^${key}=" "$ENV_FILE" \
        | head -1 \
        | cut -d'=' -f2- \
        | sed 's/[[:space:]]*#.*//' \
        | tr -d '[:space:]')

    if [[ -z "$current" ]]; then
        sed -i.bak "s|^${key}=.*|${key}=${value}|" "$ENV_FILE" \
            && rm -f "${ENV_FILE}.bak"
        echo "✅  Generated ${key}"
    else
        echo "⏭️   ${key} already set — skipping"
    fi
}

# ---------------------------------------------------------------------------
# 1. Generate secrets for any blank slots
# ---------------------------------------------------------------------------
set_if_blank "POSTGRES_PASSWORD" "$(openssl rand -hex 24)"
set_if_blank "JWT_SECRET"        "$(openssl rand -hex 64)"

# ---------------------------------------------------------------------------
# 2. Source .env so we can read the final values
# ---------------------------------------------------------------------------
# Strip comments and blank lines before sourcing
eval "$(grep -E '^[A-Z_]+=\S' "$ENV_FILE" | sed 's/[[:space:]]*#.*//' || true)"

# ---------------------------------------------------------------------------
# 3. Derive runtime vars — never stored in .env (no duplication)
# ---------------------------------------------------------------------------

# DB_URL is built from individual components
export DB_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}?sslmode=disable"

# ALLOWED_ORIGIN is derived from DOMAIN
# localhost → http (no real TLS), everything else → https
if [[ "${DOMAIN}" == "localhost" ]]; then
    export ALLOWED_ORIGIN="https://localhost"   # Caddy uses self-signed on localhost
else
    export ALLOWED_ORIGIN="https://${DOMAIN}"
fi

# Export remaining vars so docker compose picks them up
export POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB JWT_SECRET DOMAIN

echo ""
echo "🔐  Secrets ready."
echo "    DOMAIN         → ${DOMAIN}"
echo "    ALLOWED_ORIGIN → ${ALLOWED_ORIGIN}"
echo "    DB_URL         → derived (not stored)"
