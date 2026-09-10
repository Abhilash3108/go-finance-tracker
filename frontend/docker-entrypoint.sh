#!/bin/sh
# Railway sets PORT at runtime; default to 80 for local docker builds.
PORT=${PORT:-80}
sed -i "s/listen 80;/listen $PORT;/" /etc/nginx/conf.d/default.conf
exec nginx -g "daemon off;"
