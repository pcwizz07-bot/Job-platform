#!/usr/bin/env bash
set -e
DOMAIN="${1:-bespokeuisp.dedicated.co.za}"
APP_DIR="/opt/job-platform"

echo "=== Job Platform Installer for Rocky Linux ==="
echo "Domain: $DOMAIN"

# Root check
[[ $EUID -eq 0 ]] || { echo "Run as root: sudo bash install.sh"; exit 1; }

# Install deps (build tools for native modules)
dnf install -y nodejs git curl nginx certbot python3-certbot-nginx make gcc gcc-c++ python3-devel --allowerasing

# Clone the project
echo "Downloading project..."
rm -rf "$APP_DIR"
git clone https://github.com/pcwizz07-bot/Job-platform.git "$APP_DIR"
cd "$APP_DIR"

# Install & build backend
echo "Installing backend..."
cd "$APP_DIR/backend" && npm install

# Install & build frontend
echo "Installing frontend..."
cd "$APP_DIR/frontend" && npm install && npm run build

# Create systemd service
cat > /etc/systemd/system/job-platform.service <<'SERVICE'
[Unit]
Description=Job Platform API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/job-platform/backend
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable --now job-platform

# Remove conflicting default nginx configs
rm -f /etc/nginx/conf.d/default.conf /etc/nginx/conf.d/ssl.conf

# Nginx reverse proxy
cat > /etc/nginx/conf.d/job-platform.conf <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};

    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    location / {
        root /opt/job-platform/frontend/dist;
        try_files \$uri /index.html;
    }
}
NGINX

nginx -t && systemctl enable nginx && systemctl start nginx || true

# Seed admin user
sleep 3
echo "Seeding admin user..."
curl -s -X POST http://localhost:3000/api/seed

echo ""
echo "=== DONE ==="
echo "Open http://${DOMAIN} in your browser"
echo "Admin: email=admin@platform.com  password=admin123"
echo ""
echo "For SSL run:"
echo "  certbot --nginx -d ${DOMAIN}"
echo ""