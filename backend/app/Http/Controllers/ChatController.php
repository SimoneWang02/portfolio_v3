<?php

namespace App\Http\Controllers;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\Question;
use App\Services\DeepSeekClient;
use App\Services\PersonaPrompt;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

// POST /api/chat: logs the visitor's message, streams the chibi's reply as plain text,
// and records questions the AI couldn't answer for the admin dashboard.
// Preset chip questions are answered once per version of the prompt and replayed from the cache.
class ChatController extends Controller
{
    private const MAX_HISTORY = 12;
    private const MAX_CHARS = 1000;
    private const MAX_HISTORY_CHARS = 6000; // the browser sends the history, so a script could pad it to run up the bill
    private const PER_MINUTE = 6;
    private const PER_DAY = 60;
    private const SITE_PER_DAY = 1500; // circuit breaker across all visitors, caps a bad day's DeepSeek spend
    private const MAX_FORWARDS_PER_CHAT = 3;
    private const MAX_FORWARDS_PER_DAY = 10;
    private const PRESET_TTL = 60 * 60 * 24 * 30; // the key changes with the prompt anyway; this just clears out old versions
    private const REPLAY_DELAY_US = 25_000; // per word, so a cached answer still types out and the chibi talks along

    // Ends a failed reply: followed by "credit" (DeepSeek balance ran out) or "glitch"; the frontend swaps in a friendly line.
    private const OOPS_MARK = "\x1e";

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
            'messages' => ['required', 'array'],
            'messages.*' => ['array'],
            'messages.*.role' => ['nullable', 'string'],
            'messages.*.content' => ['nullable', 'string'],
            'preset' => ['sometimes', 'boolean'],
        ]);
        $budget = self::MAX_HISTORY_CHARS;
        $history = collect($data['messages'])
            ->slice(-self::MAX_HISTORY)
            ->filter(fn ($m) => in_array($m['role'] ?? null, ['user', 'assistant'], true))
            ->map(fn ($m) => ['role' => $m['role'], 'content' => mb_substr((string) ($m['content'] ?? ''), 0, self::MAX_CHARS)])
            ->reverse() // keep the newest messages that fit the budget
            ->takeWhile(function ($m) use (&$budget) {
                $budget -= mb_strlen($m['content']);

                return $budget >= 0;
            })
            ->reverse()
            ->values()
            ->all();
        abort_if(! $history || end($history)['role'] !== 'user', 422, 'The last message must be from the visitor.');
        abort_unless(config('services.deepseek.key'), 500, 'DEEPSEEK_API_KEY not set');

        $ipHash = hash_hmac('sha256', (string) $request->ip(), config('services.chat.ip_salt'));
        abort_if(
            RateLimiter::tooManyAttempts("chat:$ipHash", self::PER_MINUTE) || RateLimiter::tooManyAttempts("chat-day:$ipHash", self::PER_DAY),
            429, 'Too many messages, slow down a little.',
        );
        abort_if(RateLimiter::tooManyAttempts('chat-site', self::SITE_PER_DAY), 503, 'The chibi is resting until tomorrow.');
        RateLimiter::hit("chat:$ipHash", 60);
        RateLimiter::hit("chat-day:$ipHash", 86400);
        RateLimiter::hit('chat-site', 86400);

        $conversation = Conversation::firstOrCreate(
            ['id' => $data['conversationId']],
            ['ip_hash' => $ipHash, 'user_agent' => mb_substr((string) $request->userAgent(), 0, 255)],
        );
        $asked = $this->log($conversation, 'user', end($history)['content']);

        $system = $persona->build();
        $preset = (bool) ($data['preset'] ?? false);
        // persona.md and every dashboard answer are in $system, so editing either one starts a fresh cache
        $presetKey = 'preset-reply:'.hash('sha256', $system."\0".Question::normalize($asked->content));
        $cached = $preset ? Cache::get($presetKey) : null;

        return response()->stream(function () use ($ai, $system, $history, $conversation, $asked, $ipHash, $preset, $presetKey, $cached) {
            ignore_user_abort(true); // finish and log the reply even if the visitor closes the tab mid-stream
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
                if ($preset && ! $first['tool_calls'] && trim($reply) !== '') {
                    Cache::put($presetKey, $reply, self::PRESET_TTL);
                }
                if ($first['tool_calls']) {
                    $messages[] = ['role' => 'assistant', 'content' => $first['content'], 'tool_calls' => $first['tool_calls']];
                    foreach ($first['tool_calls'] as $call) {
                        $messages[] = ['role' => 'tool', 'tool_call_id' => $call['id'], 'content' => $this->forward($call, $asked, $ipHash)];
                    }
                    // no tools on the follow-up, so the model can't loop
                    $ai->stream($messages, null, $emit);
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
        }, 200, [
            'Content-Type' => 'text/plain; charset=utf-8',
            'Cache-Control' => 'no-cache',
            'X-Accel-Buffering' => 'no', // nginx would otherwise hold the stream until the end
        ]);
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
        if ($chatForwards >= self::MAX_FORWARDS_PER_CHAT || RateLimiter::tooManyAttempts("forward:$ipHash", self::MAX_FORWARDS_PER_DAY)) {
            return 'Not forwarded: this visitor has already sent a lot of questions. Suggest they email me instead.';
        }
        RateLimiter::hit("forward:$ipHash", 86400);

        Question::record(mb_substr($text, 0, self::MAX_CHARS), $asked);
        $asked->update(['forwarded' => true]);

        return 'Forwarded to the real me.';
    }
}
