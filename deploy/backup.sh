#!/usr/bin/env bash
# Nightly copy of the SQLite database, keeping two weeks. Cron: 15 3 * * * /var/www/portfolio/deploy/backup.sh
set -euo pipefail
DB=/var/www/portfolio/backend/database/database.sqlite
DEST=/var/backups/portfolio

mkdir -p "$DEST"
# .backup gives a consistent copy even while the site is writing (a plain cp might not)
sqlite3 "$DB" ".backup '$DEST/db-$(date +%F).sqlite'"
find "$DEST" -name 'db-*.sqlite' -mtime +14 -delete
