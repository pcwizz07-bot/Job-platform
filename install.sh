#!/usr/bin/env bash
set -e
REPO_URL="${1:-https://raw.githubusercontent.com/pcwizz07-bot/Job-platform/main}"
APP_DIR="/opt/job-platform"

echo "=== Job Platform Installer for Rocky Linux ==="

# Root check
[[ $EUID -eq 0 ]] || { echo "Run as root: sudo bash install.sh"; exit 1; }

# Install deps
dnf install -y nodejs npm git curl nginx certbot python3-certbot-nginx

# Create app dir
mkdir -p $APP_DIR
cd $APP_DIR

# Download backend
curl -sL "$REPO_URL/backend/package.json" -o backend/package.json
curl -sL "$REPO_URL/backend/server.js" -o backend/server.js
curl -sL "$REPO_URL/backend/.env" -o backend/.env

# Download frontend
for f in package.json vite.config.js index.html; do
  curl -sL "$REPO_URL/frontend/$f" -o "frontend/$f"
done
mkdir -p frontend/src frontend/src/components
for f in main.jsx App.jsx index.css api.js; do
  curl -sL "$REPO_URL/frontend/src/$f" -o "frontend/src/$f"
done
for f in Sidebar Login Dashboard JobModal Jobs Clients Technicians; do
  curl -sL "$REPO_URL/frontend/src/components/${f}.jsx" -o "frontend/src/components/${f}.jsx"
done

# Install & build
cd $APP_DIR/backend && npm install
cd $APP_DIR/frontend && npm install && npm run build

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

# Nginx reverse proxy
cat > /etc/nginx/conf.d/job-platform.conf <<'NGINX'
server {
    listen 80;
    server_name _;

    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        root /opt/job-platform/frontend/dist;
        try_files $uri /index.html;
    }
}
NGINX

nginx -t && systemctl reload nginx || systemctl restart nginx

# Seed admin user
sleep 2
curl -s -X POST http://localhost:3000/api/seed

echo ""
echo "=== DONE ==="
echo "Admin: email=admin@platform.com  password=admin123"
echo ""
echo "Set your domain and get SSL:"
echo "  certbot --nginx -d yourdomain.com"
echo ""
echo "To update: cd $APP_DIR && bash <(curl -sL <REPO_URL>/install.sh)"