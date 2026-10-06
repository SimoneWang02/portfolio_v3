<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

// Something a visitor asked that the AI couldn't answer, waiting for Simone.
#[Fillable(['conversation_id', 'message_id', 'question', 'status', 'ask_count', 'answered_at'])]
class Question extends Model
{
    public const PENDING = 'pending';
    public const ANSWERED = 'answered';
    public const DISMISSED = 'dismissed';

    protected function casts(): array
    {
        return ['answered_at' => 'datetime'];
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class);
    }

    // The same question still pending counts as asked again instead of piling up duplicates.
    public static function record(string $text, ?Message $message): self
    {
        $text = trim($text);
        $key = self::normalize($text);
        $existing = self::where('status', self::PENDING)->get()
            ->first(fn (self $q) => self::normalize($q->question) === $key);
        if ($existing) {
            $existing->increment('ask_count');
            return $existing;
        }

        return self::create([
            'question' => $text,
            'conversation_id' => $message?->conversation_id,
            'message_id' => $message?->id,
        ]);
    }

    // "What's your favourite pasta dish?" and "whats your favourite pasta dish" compare equal
    public static function normalize(string $text): string
    {
        return trim(preg_replace('/[^\p{L}\p{N}]+/u', ' ', mb_strtolower(str_replace(["'", '’'], '', $text))));
    }

    // Folds near-duplicates into the oldest one, summing how often they were asked.
    public static function merge(iterable $questions): ?self
    {
        $questions = collect($questions)->sortBy('id')->values();
        $keep = $questions->shift();
        if ($keep) {
            DB::transaction(function () use ($keep, $questions) {
                $keep->update(['ask_count' => $keep->ask_count + $questions->sum('ask_count')]);
                $questions->each->delete();
            });
        }

        return $keep;
    }

    // Turns Simone's answer into knowledge the chat uses from the next message on.
    public function answer(string $question, string $answer): Knowledge
    {
        return DB::transaction(function () use ($question, $answer) {
            $this->update(['question' => $question, 'status' => self::ANSWERED, 'answered_at' => now()]);

            return Knowledge::create(['question' => $question, 'answer' => $answer]);
        });
    }
}
