<?php

namespace App\Http\Controllers;

use App\Services\SpotifyClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;
use Throwable;

// GET /api/now-playing: my current (or last) Spotify track for the homepage widget.
// Cached briefly so every visitor's polling adds up to at most one Spotify call per CACHE_SECONDS.
class NowPlayingController extends Controller
{
    private const CACHE_SECONDS = 15;

    public function __invoke(SpotifyClient $spotify): JsonResponse|Response
    {
        if (! $spotify->configured()) {
            return response()->noContent();
        }

        $cached = Cache::remember('spotify:now-playing', self::CACHE_SECONDS, function () use ($spotify) {
            try {
                return ['track' => $spotify->nowPlaying(), 'at' => now()->getTimestampMs()];
            } catch (Throwable $e) {
                report($e);

                return ['track' => null, 'at' => now()->getTimestampMs()]; // cache the miss too, so an outage isn't retried per request
            }
        });
        $track = $cached['track'];
        if (! $track) {
            return response()->noContent();
        }

        // the cached progress is up to CACHE_SECONDS old; move it on to now
        if ($track['playing'] && $track['progressMs'] !== null) {
            $track['progressMs'] = min($track['durationMs'] ?? PHP_INT_MAX, $track['progressMs'] + now()->getTimestampMs() - $cached['at']);
        }

        return response()->json($track);
    }
}
