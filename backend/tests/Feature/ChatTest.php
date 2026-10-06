<?php

namespace Tests\Feature;

use App\Models\Conversation;
use App\Models\Knowledge;
use App\Models\Message;
use App\Models\Question;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Tests\TestCase;

class ChatTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.deepseek.key' => 'test-key']);
    }

    private function sse(array $deltas): string
    {
        $lines = array_map(fn ($d) => 'data: '.json_encode(['choices' => [['delta' => $d]]]), $deltas);

        return implode("\n\n", [...$lines, 'data: [DONE]'])."\n\n";
    }

    private function ask(string $text, ?string $conversationId = null)
    {
        return $this->postJson('/api/chat', [
            'conversationId' => $conversationId ?? (string) Str::uuid(),
            'messages' => [['role' => 'user', 'content' => $text]],
        ]);
    }

    public function test_known_answer_is_streamed_and_both_messages_logged(): void
    {
        Http::fake(['*' => Http::response($this->sse([['content' => 'I worked '], ['content' => 'at Bonobo.']]))]);

        $response = $this->ask('Where did you work?');

        $this->assertSame('I worked at Bonobo.', $response->streamedContent());
        $this->assertSame(['user', 'assistant'], Message::orderBy('id')->pluck('role')->all());
        $this->assertSame(2, Conversation::first()->message_count);
        $this->assertSame(0, Question::count());
    }

    public function test_unknown_question_is_forwarded_and_deduplicated(): void
    {
        $toolCall = $this->sse([
            ['tool_calls' => [['index' => 0, 'id' => 'call_1', 'type' => 'function', 'function' => ['name' => 'forward_question', 'arguments' => '{"question": "What is your ']]]],
            ['tool_calls' => [['index' => 0, 'function' => ['arguments' => 'favourite pasta?"}']]]],
        ]);
        $reply = $this->sse([['content' => "Don't know yet, I passed it on!"]]);
        Http::fakeSequence()->push($toolCall)->push($reply)->push($toolCall)->push($reply);

        $this->assertSame("Don't know yet, I passed it on!", $this->ask('fav pasta?')->streamedContent());
        $this->ask('whats ur favourite pasta')->streamedContent();

        $question = Question::sole();
        $this->assertSame('What is your favourite pasta?', $question->question);
        $this->assertSame(2, $question->ask_count);
        $this->assertTrue(Message::where('content', 'fav pasta?')->value('forwarded'));

        // the follow-up call sends the tool result back and offers no tools
        Http::assertSent(fn (Request $r) => collect($r['messages'])->last()['role'] === 'tool' && ! isset($r['tools']));
    }

    public function test_answers_from_the_dashboard_go_into_the_prompt(): void
    {
        Knowledge::create(['question' => 'Favourite pasta?', 'answer' => 'Carbonara, made the Roman way.']);
        Http::fake(['*' => Http::response($this->sse([['content' => 'Carbonara!']]))]);

        $this->ask('Favourite pasta?')->streamedContent();

        Http::assertSent(fn (Request $r) => str_contains($r['messages'][0]['content'], 'Carbonara, made the Roman way.'));
    }

    public function test_forwarding_is_capped_per_conversation(): void
    {
        $toolCall = $this->sse([['tool_calls' => [['index' => 0, 'id' => 'c', 'type' => 'function', 'function' => ['name' => 'forward_question', 'arguments' => '{"question": "Q?"}']]]]]);
        $sequence = Http::fakeSequence();
        foreach (range(1, 4) as $i) {
            $sequence->push(str_replace('Q?', "Question $i?", $toolCall))->push($this->sse([['content' => 'ok']]));
        }
        $id = (string) Str::uuid();
        foreach (range(1, 4) as $i) {
            $this->ask("question $i", $id)->streamedContent();
        }

        $this->assertSame(3, Question::count());
    }

    public function test_empty_balance_sends_the_credit_marker_instead_of_the_error(): void
    {
        Http::fake(['*' => Http::response(['error' => ['message' => 'Insufficient Balance']], 402)]);

        $this->assertSame("\x1ecredit", $this->ask('Who are you?')->streamedContent());
        $this->assertSame(['user'], Message::pluck('role')->all());
    }

    public function test_other_failures_send_the_glitch_marker(): void
    {
        Http::fake(['*' => Http::response('upstream down', 503)]);

        $this->assertSame("\x1eglitch", $this->ask('Who are you?')->streamedContent());
    }

    public function test_a_visitor_gets_six_messages_a_minute(): void
    {
        Http::fake(['*' => Http::response($this->sse([['content' => 'hi']]))]);
        $id = (string) Str::uuid();
        foreach (range(1, 6) as $i) {
            $this->ask("message $i", $id)->assertOk()->streamedContent();
        }

        $this->ask('one too many', $id)->assertStatus(429);
        $this->assertSame(6, Message::where('role', 'user')->count());
    }

    public function test_the_whole_site_stops_at_the_daily_cap(): void
    {
        Http::fake();
        RateLimiter::increment('chat-site', 86400, 1500);

        $this->ask('hello?')->assertStatus(503);
        Http::assertNothingSent();
    }

    public function test_padded_history_is_trimmed_to_the_newest_messages(): void
    {
        Http::fake(['*' => Http::response($this->sse([['content' => 'ok']]))]);
        $padding = array_fill(0, 11, ['role' => 'assistant', 'content' => str_repeat('x', 1000)]);

        $this->postJson('/api/chat', [
            'conversationId' => (string) Str::uuid(),
            'messages' => [...$padding, ['role' => 'user', 'content' => 'real question']],
        ])->streamedContent();

        Http::assertSent(function (Request $r) {
            $history = array_slice($r['messages'], 1); // skip the system prompt

            return count($history) === 6 && end($history)['content'] === 'real question';
        });
    }

    public function test_rejects_bad_payloads(): void
    {
        $this->postJson('/api/chat', ['conversationId' => 'nope', 'messages' => []])->assertStatus(422);
        $this->postJson('/api/chat', [
            'conversationId' => (string) Str::uuid(),
            'messages' => [['role' => 'user', 'content' => ['not', 'text']]],
        ])->assertStatus(422);
    }

    public function test_an_empty_reply_sends_the_glitch_marker(): void
    {
        Http::fake(['*' => Http::response($this->sse([['content' => '']]))]);

        $this->assertSame("\x1eglitch", $this->ask('hi')->streamedContent());
        $this->assertSame(1, Message::count()); // only the visitor's message
    }
}
