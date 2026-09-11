#!/bin/sh
# Railway sets PORT at runtime; default to 80 for local docker builds.
export PORT=${PORT:-80}
export BACKEND_URL=${BACKEND_URL:-http://localhost:8080}

# Swap nginx listen port
sed -i "s/listen 80;/listen $PORT;/" /etc/nginx/conf.d/default.conf

# Inject BACKEND_URL into the proxy_pass directive
envsubst '${BACKEND_URL}' < /etc/nginx/conf.d/default.conf > /tmp/default.conf
mv /tmp/default.conf /etc/nginx/conf.d/default.conf

exec nginx -g "daemon off;"
