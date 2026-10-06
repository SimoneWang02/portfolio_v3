<?php

namespace App\Services;

use App\Models\Knowledge;
use Filament\Notifications\Notification;
use Illuminate\Support\Facades\Http;
use Throwable;

// Asks DeepSeek whether a new answer contradicts persona.md or an earlier answer, so stale facts get cleaned up.
class ConflictCheck
{
    public function __construct(private PersonaPrompt $persona) {}

    /**
     * Empty when nothing conflicts or the check couldn't run; it never blocks saving.
     *
     * @return array<int, array{source: string, text: string, reason: string}>
     */
    public function find(string $question, string $answer, ?int $ignoreId = null): array
    {
        $known = Knowledge::orderBy('id')->when($ignoreId, fn ($q) => $q->whereKeyNot($ignoreId))->get();
        $facts = "persona.md:\n".$this->persona->persona();
        foreach ($known as $k) {
            $facts .= "\n\nanswer #{$k->id}:\nQ: {$k->question}\nA: {$k->answer}";
        }

        try {
            $content = Http::withToken(config('services.deepseek.key'))
                ->timeout(20)
                ->post(config('services.deepseek.url'), [
                    'model' => config('services.deepseek.model'),
                    'temperature' => 0,
                    'response_format' => ['type' => 'json_object'],
                    'messages' => [
                        ['role' => 'system', 'content' => <<<'TXT'
                        You compare a new fact about a person against what is already written about them.
                        List only real contradictions: places where both can't be true at once. Something the new
                        fact merely adds to, narrows or doesn't mention is not a contradiction.
                        Reply with JSON: {"conflicts": [{"source": "persona.md" or "answer #<id>", "text": "the
                        contradicted line, quoted exactly", "reason": "one short sentence"}]}, or {"conflicts": []}.
                        TXT],
                        ['role' => 'user', 'content' => "Already written:\n\n{$facts}\n\nNew fact:\nQ: {$question}\nA: {$answer}"],
                    ],
                ])
                ->throw()
                ->json('choices.0.message.content');

            return collect(json_decode($content, true)['conflicts'] ?? [])
                ->filter(fn ($c) => is_array($c) && filled($c['text'] ?? null))
                ->map(fn ($c) => ['source' => (string) ($c['source'] ?? '?'), 'text' => (string) $c['text'], 'reason' => (string) ($c['reason'] ?? '')])
                ->values()->all();
        } catch (Throwable $e) {
            report($e);

            return [];
        }
    }

    // Shows what to clean up; stays on screen until closed.
    public function warn(string $question, string $answer, ?int $ignoreId = null): void
    {
        $conflicts = $this->find($question, $answer, $ignoreId);
        if (! $conflicts) {
            return;
        }

        $lines = array_map(fn ($c) => '<b>'.e($c['source']).'</b>: “'.e($c['text']).'”'.($c['reason'] ? '<br>'.e($c['reason']) : ''), $conflicts);
        Notification::make()
            ->title('This contradicts something the chibi already knows')
            ->body(implode('<br><br>', $lines).'<br><br>The new answer wins in chat, but fix or delete the old one so they don\'t drift.')
            ->warning()
            ->persistent()
            ->send();
    }
}
