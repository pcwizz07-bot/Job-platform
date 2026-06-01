#!/usr/bin/env bash
set -e
DOMAIN="${1:-bespokeuisp.dedicated.co.za}"
JWT_SECRET="${2:-$(openssl rand -hex 32)}"

echo "=== Job Platform Docker Installer ==="
echo "Domain: $DOMAIN"

# Root check
[[ $EUID -eq 0 ]] || { echo "Run as root: sudo bash install.sh"; exit 1; }

# Install Docker if missing
if ! command -v docker &>/dev/null; then
  echo "Installing Docker..."
  dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
  dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
fi

# Clone project
echo "Downloading project..."
cd /opt
rm -rf job-platform
git clone https://github.com/pcwizz07-bot/Job-platform.git job-platform
cd /opt/job-platform

# Generate secure JWT secret
echo "JWT_SECRET=$JWT_SECRET" > backend/.env

# Build and start
echo "Building and starting..."
docker compose up -d --build

# Wait for startup
sleep 4

# Seed admin user
echo "Seeding admin user..."
curl -s -X POST http://localhost:3000/api/seed

# Setup nginx on host (optional - port 80 -> 3000)
if command -v nginx &>/dev/null; then
  rm -f /etc/nginx/conf.d/default.conf
  cat > /etc/nginx/conf.d/job-platform.conf <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX
  nginx -t && systemctl reload nginx || systemctl restart nginx || true
fi

echo ""
echo "=== DONE ==="
echo "Open http://${DOMAIN} in your browser"
echo "Admin: email=admin@platform.com  password=admin123"
echo ""
echo "Docker commands:"
echo "  docker compose logs -f    # View logs"
echo "  docker compose down       # Stop"
echo "  docker compose up -d      # Start"
echo "  docker compose pull       # Update"