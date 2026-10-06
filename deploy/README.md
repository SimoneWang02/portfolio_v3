# Deploying to Hetzner

One small VPS runs everything:
- nginx serves the React build in `dist/`.
- PHP-FPM runs the Laravel backend, which handles the chat API and the `/admin` dashboard.
- SQLite is a single file, `backend/database/database.sqlite`.

## 1. Server (once)

1. **Create the server.** In Hetzner Cloud, create a **CX23** (or a **CPX12** if CX isn't orderable) in Falkenstein or Nuremberg, running **Ubuntu 26.04**. It needs PHP 8.4+, and 26.04 ships 8.5. Add your SSH key and enable *Backups*; no volume is needed.
2. **DNS.** Point your domain's A/AAAA records at the server.
3. **Packages, firewall and a deploy user.** As root:

   ```sh
   apt update && apt upgrade -y
   apt install -y nginx git unzip sqlite3 certbot python3-certbot-nginx unattended-upgrades ufw \
     php-fpm php-cli php-sqlite3 php-mbstring php-xml php-curl php-intl php-zip php-bcmath composer nodejs npm

   ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable

   adduser --disabled-password --gecos "" deploy
   usermod -aG www-data deploy
   mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/ && chown -R deploy:deploy /home/deploy/.ssh
   echo "deploy ALL=NOPASSWD: /usr/bin/systemctl reload php8.5-fpm" > /etc/sudoers.d/deploy-fpm
   mkdir -p /var/www/portfolio /var/backups/portfolio && chown deploy:www-data /var/www/portfolio /var/backups/portfolio
   ```

4. **Key-only SSH.** Turn off password logins; root can still log in, but only with your key:

   ```sh
   printf "PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n" > /etc/ssh/sshd_config.d/10-hardening.conf
   sshd -t && systemctl reload ssh
   ```
5. **PHP-FPM.** In `/etc/php/8.5/fpm/pool.d/www.conf`, set `pm.max_children = 10`. Each chat reply keeps one worker busy for 5–15 seconds while it streams.

## 2. App (once)

1. **Get the code and create the database.** As `deploy`:

   ```sh
   git clone <repo-url> /var/www/portfolio
   cd /var/www/portfolio/backend
   cp .env.example .env
   touch database/database.sqlite
   ```

2. **Fill in `backend/.env`:**

   ```
   APP_ENV=production
   APP_DEBUG=false
   APP_URL=https://example.com
   SESSION_SECURE_COOKIE=true
   DEEPSEEK_API_KEY=...
   IP_HASH_SALT=<random, e.g. openssl rand -hex 16>
   ADMIN_EMAIL=simone.wang2002@gmail.com
   ```

3. **Generate the app key, give PHP write access and run the first deploy:**

   ```sh
   php artisan key:generate
   # PHP-FPM (www-data) writes the logs, cache and the SQLite file plus its -wal/-shm siblings
   chgrp -R www-data storage bootstrap/cache database && chmod -R g+w storage bootstrap/cache database
   ../deploy/deploy.sh
   php artisan make:filament-user    # same email as ADMIN_EMAIL
   ```

4. **nginx.** Copy `deploy/nginx.conf` to `/etc/nginx/sites-available/portfolio`, put your domain in `server_name`, then enable it and add HTTPS (as root):

   ```sh
   ln -s /etc/nginx/sites-available/portfolio /etc/nginx/sites-enabled/
   rm /etc/nginx/sites-enabled/default
   nginx -t && systemctl reload nginx
   certbot --nginx -d example.com -d www.example.com
   ```

5. **Nightly backup.** As `deploy`, run `crontab -e` and add:

   ```
   15 3 * * * /var/www/portfolio/deploy/backup.sh
   ```

   Hetzner's server backups cover the whole disk as well.

## 3. Every deploy

```sh
ssh deploy@example.com /var/www/portfolio/deploy/deploy.sh
```

## Checks

- `curl -N https://example.com/api/chat -H 'Content-Type: application/json' -d '{"conversationId":"<uuid>","messages":[{"role":"user","content":"hi"}]}'` should print the reply gradually, not all at the end.
- `/`, `/experience` and `/admin` all load. `/admin` asks you to log in.
- After the first night, `ls /var/backups/portfolio` shows a `db-YYYY-MM-DD.sqlite` file.
