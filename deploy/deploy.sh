#!/usr/bin/env bash
# Pulls and rebuilds the site on the server. Run as the deploy user: /var/www/portfolio/deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
npm ci
# build beside the live dist/ and swap it in, so visitors never hit a half-emptied folder mid-build
rm -rf dist.new dist.old
npx vite build --outDir dist.new
[ -d dist ] && mv dist dist.old
mv dist.new dist && rm -rf dist.old

cd backend
composer install --no-dev --optimize-autoloader --no-interaction
php artisan migrate --force
php artisan optimize
php artisan filament:optimize

# opcache keeps old code until PHP-FPM reloads (allowed without a password, see deploy/README.md)
sudo systemctl reload "${PHP_FPM:-php8.5-fpm}"
echo "Deployed $(git rev-parse --short HEAD)"
