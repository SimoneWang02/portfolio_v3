#!/usr/bin/env bash
# Pulls and rebuilds the site on the server. Run as the deploy user: /var/www/portfolio/deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
npm ci
npm run build

cd backend
composer install --no-dev --optimize-autoloader --no-interaction
php artisan migrate --force
php artisan optimize
php artisan filament:optimize

# opcache keeps old code until PHP-FPM reloads (allowed without a password, see deploy/README.md)
sudo systemctl reload "${PHP_FPM:-php8.5-fpm}"
echo "Deployed $(git rev-parse --short HEAD)"
