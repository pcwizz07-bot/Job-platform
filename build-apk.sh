#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"
echo "=== Building JobBoard APK ==="

# Check if mobile repo exists
MOBILE_DIR="/opt/job-platform-mobile"
if [ ! -d "$MOBILE_DIR" ]; then
  echo "Cloning mobile repo..."
  cd /opt
  git clone https://github.com/pcwizz07-bot/Job-platform-mobile.git
fi

cd "$MOBILE_DIR"

# Pull latest
git pull

# Install deps
npm install

# Ensure EAS CLI
npx --yes eas-cli --version 2>/dev/null || npm install -g eas-cli

# We need Expo login credentials. Check if they're set
if [ -z "$EXPO_USERNAME" ] || [ -z "$EXPO_PASSWORD" ]; then
  echo "WARNING: EXPO_USERNAME and EXPO_PASSWORD not set."
  echo "Build may fail if not logged in."
  echo "Set them in /etc/profile.d/cto-env-vars.sh or run:"
  echo "  npx eas login"
fi

# Build APK via EAS
echo "Triggering EAS build..."
npx eas build -p android --profile preview --non-interactive --wait 2>&1 | tee /tmp/eas-build.log

# After build, look for the APK URL in logs
APK_URL=$(grep -o 'https://[^ ]*\.apk' /tmp/eas-build.log | head -1)

if [ -n "$APK_URL" ]; then
  echo "Downloading APK from: $APK_URL"
  mkdir -p /opt/job-platform/apk
  curl -L "$APK_URL" -o "/opt/job-platform/apk/jobboard-v$(date +%Y%m%d).apk"
  echo "APK saved to /opt/job-platform/apk/"
else
  echo "Build submitted. Check status: https://expo.dev/accounts/pcwizz07-bot/projects/jobboard-mobile/builds"
  echo "Once complete, manually download and place in /opt/job-platform/apk/"
fi