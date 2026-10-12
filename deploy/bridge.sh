#!/bin/sh
# Run by the nginx image at start. When QANVAS_BRIDGE_URL is set (quantum-lab sets it), /api/ is
# forwarded to quantum-lab's bridge; otherwise /api/ doesn't exist and Qanvas hides the lab-only buttons.
set -eu
conf=/etc/nginx/qanvas/bridge.conf
if [ -z "${QANVAS_BRIDGE_URL:-}" ]; then
    echo 'location /api/ { return 404; }' > "$conf"
    exit 0
fi
# Resolving the bridge's name per request lets nginx start even when the bridge isn't up yet.
resolver=$(awk '/^nameserver/ { print $2; exit }' /etc/resolv.conf)
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
