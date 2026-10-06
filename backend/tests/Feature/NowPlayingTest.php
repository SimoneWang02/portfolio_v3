<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class NowPlayingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.spotify' => ['client_id' => 'id', 'client_secret' => 'secret', 'refresh_token' => 'refresh']]);
    }

    private function track(string $name): array
    {
        return [
            'name' => $name,
            'artists' => [['name' => 'Artist A'], ['name' => 'Artist B']],
            'album' => ['name' => 'Album', 'images' => [
                ['url' => 'big.jpg', 'width' => 640], ['url' => 'mid.jpg', 'width' => 300], ['url' => 'small.jpg', 'width' => 64],
            ]],
            'external_urls' => ['spotify' => 'https://open.spotify.com/track/1'],
            'duration_ms' => 200000,
        ];
    }

    private function fake(array $current, array $recent = []): void
    {
        Http::fake([
            'accounts.spotify.com/*' => Http::response(['access_token' => 'access', 'expires_in' => 3600]),
            'api.spotify.com/v1/me/player/currently-playing' => $current ? Http::response($current) : Http::response(null, 204),
            'api.spotify.com/v1/me/player/recently-played*' => Http::response(['items' => $recent]),
        ]);
    }

    public function test_current_track_is_returned(): void
    {
        $this->fake(['is_playing' => true, 'progress_ms' => 1000, 'currently_playing_type' => 'track', 'item' => $this->track('Song')]);

        $this->getJson('/api/now-playing')->assertOk()->assertJson([
            'playing' => true, 'title' => 'Song', 'artists' => 'Artist A, Artist B', 'album' => 'Album',
            'image' => 'mid.jpg', 'url' => 'https://open.spotify.com/track/1', 'durationMs' => 200000, 'playedAt' => null,
        ]);
    }

    public function test_falls_back_to_last_played_when_nothing_is_playing(): void
    {
        $this->fake([], [['played_at' => '2026-10-05T10:00:00Z', 'track' => $this->track('Old song')]]);

        $this->getJson('/api/now-playing')->assertOk()->assertJson(['playing' => false, 'title' => 'Old song', 'playedAt' => '2026-10-05T10:00:00Z']);
    }

    public function test_responses_are_cached(): void
    {
        $this->fake(['is_playing' => true, 'progress_ms' => 1000, 'currently_playing_type' => 'track', 'item' => $this->track('Song')]);

        $this->getJson('/api/now-playing')->assertOk();
        $this->getJson('/api/now-playing')->assertOk();

        Http::assertSentCount(2); // one token exchange, one currently-playing
    }

    public function test_empty_when_not_configured_or_spotify_fails(): void
    {
        config(['services.spotify.refresh_token' => null]);
        $this->getJson('/api/now-playing')->assertNoContent();

        config(['services.spotify.refresh_token' => 'refresh']);
        Http::fake(['*' => Http::response('nope', 500)]);
        $this->getJson('/api/now-playing')->assertNoContent();
    }

    public function test_a_rejected_access_token_is_refreshed_next_time(): void
    {
        Cache::put('spotify:access-token', 'revoked', now()->addMinutes(50));
        Http::fake(['api.spotify.com/*' => Http::response(null, 401)]);

        $this->getJson('/api/now-playing')->assertNoContent();

        $this->assertFalse(Cache::has('spotify:access-token'));
    }
}
