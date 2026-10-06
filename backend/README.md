# Chibi backend

Laravel app behind the portfolio's chat. It does four things:

- `POST /api/chat`: streams the chibi's reply from DeepSeek. The system prompt is `../persona.md` plus every answer saved in the dashboard. Every message is logged. When the AI can't answer something about me, it calls the `forward_question` tool and the question lands in the dashboard.
- `/admin`: Filament dashboard with three sections. **Unanswered** holds the forwarded questions, with a red badge; answering one teaches the chibi. **Conversations** has every chat, with the ones that have unanswered questions highlighted. **Knowledge** has the saved answers.
- `GET /api/now-playing`: my current or last-played Spotify track for the homepage card, cached for 15 seconds. It needs `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` and `SPOTIFY_REFRESH_TOKEN` in `.env`; `php artisan spotify:auth` gets the refresh token. Without them the route returns 204 and the card stays hidden.
- Serves `../dist/index.html` for the React site's routes in production.

## Local setup

```sh
composer setup                    # install, .env, key, sqlite file, migrations
# then fill DEEPSEEK_API_KEY, IP_HASH_SALT and ADMIN_EMAIL in .env
php artisan make:filament-user    # use the same email as ADMIN_EMAIL
composer dev                      # php artisan serve on :8000
```

Run `npm run dev` in the repo root alongside it. Vite (port 4200) proxies `/api` here. Open the dashboard at http://localhost:8000/admin.

Tests: `php artisan test`.

Deployment is described in `../deploy/README.md`.
