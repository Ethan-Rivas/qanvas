#!/bin/sh
# Run by the nginx image at start. When QANVAS_BRIDGE_URL is set (quantum-lab sets it), /api/ is
# forwarded to quantum-lab's bridge; otherwise /api/ doesn't exist and Qanvas hides the lab-only buttons.
set -eu
conf=/etc/nginx/qanvas/bridge.conf
if [ -z "${QANVAS_BRIDGE_URL:-}" ]; then
    echo 'location /api/ { return 404; }' > "$conf"
    exit 0
fi
# Only a plain address such as http://lab-bridge:8000: the value goes into nginx's config as is.
if ! echo "$QANVAS_BRIDGE_URL" | grep -Eq '^https?://[A-Za-z0-9.-]+(:[0-9]+)?/?$'; then
    echo "Qanvas: QANVAS_BRIDGE_URL must look like http://host:port, not '$QANVAS_BRIDGE_URL'" >&2
    exit 1
fi
# Resolving the bridge's name per request lets nginx start even when the bridge isn't up yet.
resolver=$(awk '/^nameserver/ { print $2; exit }' /etc/resolv.conf)
if [ -z "$resolver" ]; then
    echo "Qanvas: no nameserver in /etc/resolv.conf, so the bridge's name can't be resolved" >&2
    exit 1
fi
case "$resolver" in *:*) resolver="[${resolver%%%*}]" ;; esac
cat > "$conf" <<CONF
location /api/ {
    resolver $resolver valid=10s;
    set \$bridge ${QANVAS_BRIDGE_URL%/};
    rewrite ^/api/(.*)\$ /\$1 break;
    proxy_pass \$bridge;
    proxy_set_header Host \$http_host;
    client_max_body_size 5m;
}
CONF
echo "Qanvas: forwarding /api/ to $QANVAS_BRIDGE_URL"
