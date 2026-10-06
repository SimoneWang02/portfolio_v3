<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

// Reads what I'm listening to from the Spotify Web API, using the long-lived refresh token in .env
// (get one with php artisan spotify:auth).
class SpotifyClient
{
    public const SCOPES = 'user-read-currently-playing user-read-recently-played';

    public function configured(): bool
    {
        return (bool) (config('services.spotify.client_id') && config('services.spotify.client_secret') && config('services.spotify.refresh_token'));
    }

    /**
     * The track playing (or paused) right now, else the last one played; null if there is neither.
     *
     * @return array{playing: bool, title: string, artists: string, album: string, image: ?string, url: ?string, progressMs: ?int, durationMs: ?int, playedAt: ?string}|null
     */
    public function nowPlaying(): ?array
    {
        $current = $this->get('me/player/currently-playing');
        $item = $current['item'] ?? null;
        if ($item && ($current['currently_playing_type'] ?? null) === 'track') {
            return [...$this->track($item), 'playing' => (bool) $current['is_playing'], 'progressMs' => $current['progress_ms'] ?? null, 'playedAt' => null];
        }

        $last = $this->get('me/player/recently-played', ['limit' => 1])['items'][0] ?? null;

        return $last ? [...$this->track($last['track']), 'playing' => false, 'progressMs' => null, 'playedAt' => $last['played_at']] : null;
    }

    private function track(array $t): array
    {
        return [
            'title' => $t['name'],
            'artists' => collect($t['artists'])->pluck('name')->join(', '),
            'album' => $t['album']['name'] ?? '',
            'image' => collect($t['album']['images'] ?? [])->sortBy('width')->firstWhere('width', '>=', 120)['url'] ?? null,
            'url' => $t['external_urls']['spotify'] ?? null,
            'durationMs' => $t['duration_ms'] ?? null,
        ];
    }

    // GET against the Web API; an empty array for 204 (nothing playing)
    private function get(string $path, array $query = []): array
    {
        $response = Http::withToken($this->accessToken())->timeout(5)->get("https://api.spotify.com/v1/$path", $query);
        if ($response->failed()) {
            throw new RuntimeException("Spotify $path returned {$response->status()}");
        }

        return $response->json() ?? [];
    }

    // access tokens last an hour; trade the refresh token for a fresh one shortly before that
    private function accessToken(): string
    {
        return Cache::remember('spotify:access-token', now()->addMinutes(50), function () {
            $response = $this->token(['grant_type' => 'refresh_token', 'refresh_token' => config('services.spotify.refresh_token')]);

            return $response['access_token'];
        });
    }

    public function token(array $form): array
    {
        $response = Http::asForm()
            ->withBasicAuth(config('services.spotify.client_id'), config('services.spotify.client_secret'))
            ->timeout(5)
            ->post('https://accounts.spotify.com/api/token', $form);
        if ($response->failed()) {
            throw new RuntimeException("Spotify token request returned {$response->status()}: ".substr($response->body(), 0, 200));
        }

        return $response->json();
    }
}
