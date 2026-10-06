<?php

use App\Services\SpotifyClient;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// One-time: authorize my Spotify account and print the refresh token for SPOTIFY_REFRESH_TOKEN.
// The redirect page won't load (nothing listens there); the code is in its address bar.
Artisan::command('spotify:auth {redirected? : the address Spotify sent you to, or just its code}', function (SpotifyClient $spotify) {
    if (! config('services.spotify.client_id') || ! config('services.spotify.client_secret')) {
        return $this->error('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env first.');
    }
    $redirect = config('services.spotify.redirect_uri');
    $pasted = trim((string) $this->argument('redirected'));
    if ($pasted === '') {
        $this->line('Open this, approve, then copy the address of the page it sends you to:');
        $this->newLine();
        $this->line('https://accounts.spotify.com/authorize?'.http_build_query([
            'client_id' => config('services.spotify.client_id'),
            'response_type' => 'code',
            'redirect_uri' => $redirect,
            'scope' => SpotifyClient::SCOPES,
        ]));
        $this->newLine();
        $pasted = trim($this->ask('Paste that address (or just the code)'));
    }
    parse_str((string) parse_url($pasted, PHP_URL_QUERY), $query);
    $tokens = $spotify->token(['grant_type' => 'authorization_code', 'code' => $query['code'] ?? $pasted, 'redirect_uri' => $redirect]);

    $this->info('Add this to .env:');
    $this->line('SPOTIFY_REFRESH_TOKEN='.$tokens['refresh_token']);
})->purpose('Get the Spotify refresh token for the now-playing widget');
