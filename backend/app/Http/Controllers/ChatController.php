<?php

namespace App\Http\Controllers;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\Question;
use App\Services\DeepSeekClient;
use App\Services\PersonaPrompt;
use Illuminate\Contracts\Cache\Lock;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

// POST /api/chat: logs the visitor's message, streams the chibi's reply as plain text,
// with the chat so far rebuilt from the log (never taken from the browser, so nobody can put words in the chibi's mouth),
// and records questions the AI couldn't answer for the admin dashboard.
// Preset chip questions are answered once per version of the prompt and replayed from the cache.
class ChatController extends Controller
{
    private const MAX_HISTORY = 12;
    private const MAX_CHARS = 1000;
    private const MAX_HISTORY_CHARS = 6000; // keeps long chats from running up the bill
    private const PER_MINUTE = 6;
    private const PER_DAY = 60;
    private const SITE_PER_DAY = 1500; // circuit breaker across all visitors, caps a bad day's DeepSeek spend
    private const MAX_FORWARDS_PER_CHAT = 3;
    private const MAX_FORWARDS_PER_DAY = 10;
    private const MAX_STREAMS = 6; // replies streaming at once; PHP-FPM has 10 workers and the dashboard needs some too
    private const STREAM_SLOT_TTL = 180; // a crashed worker's slot frees itself; a reply is at most three 60s DeepSeek calls
    private const PRESET_TTL = 60 * 60 * 24 * 30; // the key changes with the prompt anyway; this just clears out old versions
    private const REPLAY_DELAY_US = 25_000; // per word, so a cached answer still types out and the chibi talks along

    // Ends a failed reply: followed by "credit" (DeepSeek balance ran out) or "glitch"; the frontend swaps in a friendly line.
    private const OOPS_MARK = "\x1e";

    private const FORWARDED = 'Forwarded to the real me.';

    // The chips in src/content.js. Only these get the shared cached answer, whatever `preset` the browser sends.
    private const PRESETS = ['Who are you?', 'Looking for an internship?', "Biggest mistake you've made?", 'What do you do for fun?', 'Why did you get into coding?'];

    // "I've passed it on", "passed your question about X on to the real me"...
    private const CLAIMS_FORWARD = '/\bpass(?:ed|ing)\b[^.!?]{0,80}?\bon\b/i';

    private const FORCE_FORWARD = ['type' => 'function', 'function' => ['name' => 'forward_question']];

    private const FORWARD_TOOL = [
        'type' => 'function',
        'function' => [
            'name' => 'forward_question',
            'description' => "Send a question about the site owner that you can't answer to the real owner, who will answer it later.",
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'question' => ['type' => 'string', 'description' => "The visitor's question as a short standalone question addressed to me in second person, e.g. 'What is your favourite pasta dish?'"],
                ],
                'required' => ['question'],
            ],
        ],
    ];

    public function __invoke(Request $request, DeepSeekClient $ai, PersonaPrompt $persona): StreamedResponse
    {
        $data = $request->validate([
            'conversationId' => ['required', 'uuid'],
            'message' => ['required', 'string'],
            'preset' => ['sometimes', 'boolean'],
        ]);
        $text = mb_substr(trim($data['message']), 0, self::MAX_CHARS);
        abort_if($text === '', 422, 'The message is empty.');
        abort_unless(config('services.deepseek.key'), 500, 'DEEPSEEK_API_KEY not set');

        $ipHash = hash_hmac('sha256', (string) $request->ip(), config('services.chat.ip_salt'));
        // a chat belongs to the network it started on, so knowing its id isn't enough to read or add to it;
        // the browser answers 409 by starting a new chat
        abort_if(
            Conversation::whereKey($data['conversationId'])->where('ip_hash', '!=', $ipHash)->exists(),
            409, 'This chat started somewhere else.',
        );

        // count first, then check what the count came to: checking and counting separately let parallel requests slip past
        abort_if(
            RateLimiter::hit("chat:$ipHash", 60) > self::PER_MINUTE || RateLimiter::hit("chat-day:$ipHash", 86400) > self::PER_DAY,
            429, 'Too many messages, slow down a little.',
        );
        abort_if(RateLimiter::hit('chat-site', 86400) > self::SITE_PER_DAY, 503, 'The chibi is resting until tomorrow.');
        $slot = $this->streamSlot();
        abort_unless($slot, 503, 'The chibi is busy, try again in a moment.', ['Retry-After' => '15']);

        try {
            $conversation = Conversation::firstOrCreate(
                ['id' => $data['conversationId']],
                ['ip_hash' => $ipHash, 'user_agent' => mb_substr((string) $request->userAgent(), 0, 255)],
            );
            $asked = $this->log($conversation, 'user', $text);
            $history = $this->history($conversation);

            $system = $persona->build();
            $preset = ($data['preset'] ?? false) && in_array(Question::normalize($text), array_map(Question::normalize(...), self::PRESETS), true);
            // persona.md and every dashboard answer are in $system, so editing either one starts a fresh cache
            $presetKey = 'preset-reply:'.hash('sha256', $system."\0".Question::normalize($asked->content));
            $cached = $preset ? Cache::get($presetKey) : null;
        } catch (Throwable $e) {
            $slot->release();
            throw $e;
        }

        return response()->stream(function () use ($ai, $system, $history, $conversation, $asked, $ipHash, $preset, $presetKey, $cached, $slot) {
            ignore_user_abort(true); // finish and log the reply even if the visitor closes the tab mid-stream
            try {
                $this->reply($ai, $system, $history, $conversation, $asked, $ipHash, $preset, $presetKey, $cached);
            } finally {
                $slot->release();
            }
        }, 200, [
            'Content-Type' => 'text/plain; charset=utf-8',
            'Cache-Control' => 'no-cache',
            'X-Accel-Buffering' => 'no', // nginx would otherwise hold the stream until the end
        ]);
    }

    // One of MAX_STREAMS locks, held while a reply streams, or null when they're all taken.
    private function streamSlot(): ?Lock
    {
        foreach (range(1, self::MAX_STREAMS) as $i) {
            $lock = Cache::lock("chat-stream:$i", self::STREAM_SLOT_TTL);
            if ($lock->get()) {
                return $lock;
            }
        }

        return null;
    }

    private function reply(DeepSeekClient $ai, string $system, array $history, Conversation $conversation, Message $asked, string $ipHash, bool $preset, string $presetKey, ?string $cached): void
    {
        $reply = '';
        $emit = function (string $text) use (&$reply) {
            $reply .= $text;
            echo $text;
            if (ob_get_level()) {
                ob_flush();
            }
            flush();
        };

        if ($cached !== null) {
            foreach (preg_split('/(?<=\s)/u', $cached, -1, PREG_SPLIT_NO_EMPTY) as $word) {
                $emit($word);
                usleep(self::REPLAY_DELAY_US);
            }
            $this->log($conversation, 'assistant', $reply);

            return;
        }

        try {
            // a preset answer is shared by every visitor, so it's written from the question alone, not this chat
            $messages = [['role' => 'system', 'content' => $system], ...($preset ? [end($history)] : $history)];
            $first = $ai->stream($messages, [self::FORWARD_TOOL], $emit);
            $claimed = ! $first['tool_calls'] && preg_match(self::CLAIMS_FORWARD, $first['content']);
            if ($claimed) {
                // it told the visitor it passed the question on but never called the tool: ask again with the
                // tool forced, quietly, so the question really reaches the dashboard
                $forced = $ai->stream($messages, [self::FORWARD_TOOL], fn () => null, self::FORCE_FORWARD);
                foreach ($forced['tool_calls'] as $call) {
                    $this->forward($call, $asked, $ipHash);
                }
            }
            if ($preset && ! $first['tool_calls'] && ! $claimed && trim($reply) !== '') {
                Cache::put($presetKey, $reply, self::PRESET_TTL);
            }
            if ($first['tool_calls']) {
                $messages[] = ['role' => 'assistant', 'content' => $first['content'], 'tool_calls' => $first['tool_calls']];
                $allForwarded = true;
                foreach ($first['tool_calls'] as $call) {
                    $result = $this->forward($call, $asked, $ipHash);
                    $allForwarded = $allForwarded && $result === self::FORWARDED;
                    $messages[] = ['role' => 'tool', 'tool_call_id' => $call['id'], 'content' => $result];
                }
                // the model often writes its "passed it on" line alongside the call; if that's already true, don't say it twice
                if (trim($first['content']) === '' || ! $allForwarded) {
                    // no tools on the follow-up, so the model can't loop
                    $ai->stream($messages, null, $emit);
                }
            }
            if (trim($reply) === '') {
                echo self::OOPS_MARK.'glitch'; // the model said nothing; don't leave the visitor with an empty bubble
            }
        } catch (Throwable $e) {
            report($e);
            $credit = $e instanceof RequestException && $e->response->status() === 402;
            echo self::OOPS_MARK.($credit ? 'credit' : 'glitch');
        } finally {
            if (trim($reply) !== '') {
                $this->log($conversation, 'assistant', $reply);
            }
        }
    }

    // The newest logged messages that fit the budget, oldest first; the last one is the message just logged.
    private function history(Conversation $conversation): array
    {
        $budget = self::MAX_HISTORY_CHARS;

        return $conversation->messages()->reorder('id', 'desc')->limit(self::MAX_HISTORY)->get(['role', 'content'])
            ->map(fn (Message $m) => ['role' => $m->role, 'content' => mb_substr($m->content, 0, self::MAX_CHARS)])
            ->takeWhile(function ($m) use (&$budget) {
                $budget -= mb_strlen($m['content']);

                return $budget >= 0;
            })
            ->reverse()
            ->values()
            ->all();
    }

    private function log(Conversation $conversation, string $role, string $content): Message
    {
        $conversation->increment('message_count');

        return $conversation->messages()->create(['role' => $role, 'content' => $content]);
    }

    // Records the tool call as a pending question; the returned string is what the model sees as the tool result.
    private function forward(array $call, Message $asked, string $ipHash): string
    {
        if (($call['function']['name'] ?? '') !== 'forward_question') {
            return 'Unknown tool.';
        }
        $text = trim(json_decode($call['function']['arguments'] ?? '', true)['question'] ?? '') ?: $asked->content;

        $chatForwards = Message::where('conversation_id', $asked->conversation_id)->where('forwarded', true)->count();
        if ($chatForwards >= self::MAX_FORWARDS_PER_CHAT || RateLimiter::hit("forward:$ipHash", 86400) > self::MAX_FORWARDS_PER_DAY) {
            return 'Not forwarded: this visitor has already sent a lot of questions. Suggest they email me instead.';
        }

        Question::record(mb_substr($text, 0, self::MAX_CHARS), $asked);
        $asked->update(['forwarded' => true]);

        return self::FORWARDED;
    }
}
