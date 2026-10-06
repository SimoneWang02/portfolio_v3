<?php

namespace App\Console\Commands;

use App\Services\ChibiReply;
use App\Services\DeepSeekClient;
use App\Services\PersonaPrompt;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Concurrency;
use Throwable;

// Asks the real model every question in evals/chibi.php a few times and grades each reply:
// code checks for the hard rules (forwarded or not, no emoji, says it once), and a second DeepSeek call
// as judge for the fuzzier ones ("says yes first"). Each run is saved so the next one can show what changed.
class ChibiEval extends Command
{
    protected $signature = 'chibi:eval
        {--runs=3 : times to ask each question, since replies vary}
        {--only= : comma-separated case ids or id prefixes, e.g. "facts.,followup.vacation-where"}
        {--parallel=8 : conversations at once (1 runs them in this process)}
        {--cases= : cases file, defaults to evals/chibi.php}';

    protected $description = 'Ask the chibi every eval question against the real model and grade the answers';

    private const JUDGE_PROMPT = <<<'TXT'
    You grade one reply from mini-Simone, a chatbot on Simone Wang's portfolio site that speaks as Simone in first person.
    You get the conversation, the reply, whether the chatbot forwarded the question to the real Simone, and one criterion.
    Judge only that criterion, literally and strictly. Answer in JSON: {"pass": true or false, "reason": "one short sentence"}.
    TXT;

    public function handle(): int
    {
        $cases = require $this->option('cases') ?: base_path('evals/chibi.php');
        if ($only = array_filter(explode(',', (string) $this->option('only')))) {
            $cases = array_values(array_filter($cases, fn ($c) => collect($only)->contains(fn ($o) => str_starts_with($c['id'], trim($o)))));
        }
        $ids = array_column($cases, 'id');
        if ($dupes = array_diff_assoc($ids, array_unique($ids))) {
            $this->error('Duplicate case ids: '.implode(', ', $dupes));

            return self::FAILURE;
        }
        if (! $cases) {
            $this->error('No cases match.');

            return self::FAILURE;
        }

        $runs = max(1, (int) $this->option('runs'));
        $parallel = max(1, (int) $this->option('parallel'));
        $tasks = [];
        foreach ($cases as $case) {
            foreach (range(1, $runs) as $_) {
                $tasks[] = $case;
            }
        }

        $this->info(sprintf('Asking %d questions %d time(s) each (%d conversations, %d at once)', count($cases), $runs, count($tasks), $parallel));
        $started = microtime(true);
        $bar = $this->output->createProgressBar(count($tasks));
        $results = [];
        foreach (array_chunk($tasks, $parallel, true) as $chunk) {
            $jobs = [];
            foreach ($chunk as $key => $case) {
                // its own statement: the closure serializer can't tell two closures on one line apart.
                // base64 because the child prints its result through the console formatter, which eats any <tag> in a reply
                $jobs[$key] = static function () use ($case) {
                    return base64_encode(json_encode(ChibiEval::runOnce($case)));
                };
            }
            $done = $parallel === 1 ? Concurrency::driver('sync')->run($jobs) : Concurrency::run($jobs);
            foreach ($done as $key => $result) {
                $results[$chunk[$key]['id']][] = json_decode(base64_decode($result), true);
            }
            $bar->advance(count($chunk));
        }
        $bar->finish();
        $this->newLine(2);

        $previous = $this->previousReport();
        $report = $this->report($cases, $results, $previous);
        $this->newLine();
        $this->line(sprintf('Took %ds. Report saved to %s', microtime(true) - $started, $this->save($cases, $results, $runs)));

        return $report ? self::SUCCESS : self::FAILURE;
    }

    /** One conversation: replay the history, ask, grade. Runs in a child process, so it only gets the case. */
    public static function runOnce(array $case): array
    {
        try {
            $messages = [['role' => 'system', 'content' => app(PersonaPrompt::class)->build()]];
            foreach (array_values($case['history'] ?? []) as $i => $text) {
                $messages[] = ['role' => $i % 2 ? 'assistant' : 'user', 'content' => $text];
            }
            $messages[] = ['role' => 'user', 'content' => $case['ask']];

            $reply = '';
            $questions = [];
            $result = app(ChibiReply::class)->stream(
                $messages,
                function (string $text) use (&$reply) {
                    $reply .= $text;
                },
                function (array $call) use (&$questions) {
                    $questions[] = trim(json_decode($call['function']['arguments'] ?? '', true)['question'] ?? '');

                    return ChibiReply::FORWARDED;
                },
            );

            $failures = self::check($case, $reply, $result['forwarded'], $questions);
            if (isset($case['judge'])) {
                [$pass, $reason] = self::judge($case, $reply, $questions);
                if (! $pass) {
                    $failures[] = "judge: $reason";
                }
            }

            return ['reply' => $reply, 'forwarded' => $questions, 'faked' => $result['faked'], 'failures' => $failures];
        } catch (Throwable $e) {
            return ['reply' => '', 'forwarded' => [], 'faked' => false, 'failures' => ['error: '.$e->getMessage()], 'error' => true];
        }
    }

    // The rules every reply must follow, plus the case's own code checks.
    private static function check(array $case, string $reply, bool $forwarded, array $questions): array
    {
        $failures = [];
        if (trim($reply) === '') {
            $failures[] = 'empty reply';
        }
        if (preg_match('/\p{Extended_Pictographic}/u', $reply)) {
            $failures[] = 'uses emoji';
        }
        if (preg_match('/^#{1,6}\s/m', $reply)) {
            $failures[] = 'uses a markdown heading';
        }
        if (preg_match_all(ChibiReply::CLAIMS_FORWARD, $reply) > 1) {
            $failures[] = 'says it passed the question on more than once';
        }

        $expect = $case['forward'] ?? null;
        if ($expect === true && ! $forwarded) {
            $failures[] = "didn't forward the question";
        } elseif ($expect === false && $forwarded) {
            $failures[] = 'forwarded instead of answering: "'.implode('", "', $questions).'"';
        }
        if (isset($case['forwarded_match']) && $forwarded && ! collect($questions)->contains(fn ($q) => preg_match($case['forwarded_match'], $q))) {
            $failures[] = "forwarded question doesn't match {$case['forwarded_match']}: \"".implode('", "', $questions).'"';
        }

        foreach ((array) ($case['match'] ?? []) as $pattern) {
            if (! preg_match($pattern, $reply)) {
                $failures[] = "missing $pattern";
            }
        }
        foreach ((array) ($case['not_match'] ?? []) as $pattern) {
            if (preg_match($pattern, $reply)) {
                $failures[] = "shouldn't match $pattern";
            }
        }
        $words = count(preg_split('/\s+/u', trim($reply), -1, PREG_SPLIT_NO_EMPTY));
        if (isset($case['max_words']) && $words > $case['max_words']) {
            $failures[] = "too long: $words words (max {$case['max_words']})";
        }

        return $failures;
    }

    private static function judge(array $case, string $reply, array $questions): array
    {
        $lines = [];
        foreach (array_values($case['history'] ?? []) as $i => $text) {
            $lines[] = ($i % 2 ? 'Chatbot: ' : 'Visitor: ').$text;
        }
        $lines[] = 'Visitor: '.$case['ask'];
        $forwarded = $questions
            ? 'It forwarded this question to the real Simone: "'.implode('", "', $questions).'"'
            : 'It did not forward anything to the real Simone.';

        $out = app(DeepSeekClient::class)->stream([
            ['role' => 'system', 'content' => self::JUDGE_PROMPT],
            ['role' => 'user', 'content' => "Conversation so far:\n".implode("\n", $lines)."\n\nThe chatbot's reply:\n$reply\n\n$forwarded\n\nCriterion: {$case['judge']}"],
        ], null, fn () => null, null, ['temperature' => 0, 'response_format' => ['type' => 'json_object']]);
        $verdict = json_decode($out['content'], true);

        return [($verdict['pass'] ?? false) === true, $verdict['reason'] ?? 'the judge gave no verdict'];
    }

    // Prints one line per case, the failing replies, and a summary per tag. True if every run passed.
    private function report(array $cases, array $results, array $previous): bool
    {
        $tags = [];
        $faked = 0;
        $errors = 0;
        foreach ($cases as $case) {
            $runs = $results[$case['id']];
            $passed = count(array_filter($runs, fn ($r) => ! $r['failures']));
            $total = count($runs);
            $faked += count(array_filter($runs, fn ($r) => $r['faked']));
            $errors += count(array_filter($runs, fn ($r) => $r['error'] ?? false));
            $tag = $case['tag'] ?? strtok($case['id'], '.');
            $tags[$tag] ??= ['cases' => 0, 'passed' => 0, 'runs' => 0];
            $tags[$tag]['cases']++;
            $tags[$tag]['passed'] += $passed;
            $tags[$tag]['runs'] += $total;

            $was = isset($previous[$case['id']]) && $previous[$case['id']] !== "$passed/$total" ? "  <fg=gray>(was {$previous[$case['id']]})</>" : '';
            $mark = $passed === $total ? '<fg=green>✓</>' : ($passed === 0 ? '<fg=red>✗</>' : '<fg=yellow>~</>');
            $this->line("  $mark $passed/$total  {$case['id']}$was");
            foreach ($runs as $run) {
                if (! $run['failures']) {
                    continue;
                }
                foreach ($run['failures'] as $failure) {
                    $this->line("        <fg=red>- $failure</>");
                }
                $this->line('          <fg=gray>reply: '.str_replace("\n", ' ', mb_strimwidth($run['reply'], 0, 220, '...')).'</>');
            }
        }

        $this->newLine();
        $rows = [];
        $all = ['passed' => 0, 'runs' => 0];
        foreach ($tags as $tag => $t) {
            $rows[] = [$tag, $t['cases'], "{$t['passed']}/{$t['runs']}", round(100 * $t['passed'] / $t['runs']).'%'];
            $all['passed'] += $t['passed'];
            $all['runs'] += $t['runs'];
        }
        $rows[] = ['<options=bold>all</>', count($cases), "{$all['passed']}/{$all['runs']}", '<options=bold>'.round(100 * $all['passed'] / $all['runs']).'%</>'];
        $this->table(['tag', 'cases', 'runs passed', 'rate'], $rows);

        if ($faked) {
            $this->line("<fg=yellow>$faked replies said they passed the question on without calling the tool</> (the server forced the call, so these still count as forwarded).");
        }
        if ($errors) {
            $this->line("<fg=red>$errors conversations failed with an error</> (counted as failures).");
        }

        return $all['passed'] === $all['runs'];
    }

    private function save(array $cases, array $results, int $runs): string
    {
        $dir = storage_path('app/evals');
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $path = $dir.'/'.now()->format('Y-m-d_His').'.json';
        file_put_contents($path, json_encode([
            'date' => now()->toIso8601String(),
            'model' => config('services.deepseek.model'),
            'runs' => $runs,
            'cases' => array_map(fn ($c) => [...$c, 'results' => $results[$c['id']]], $cases),
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

        return str_replace(base_path().'/', '', $path);
    }

    /** @return array<string, string> case id => "passed/total" from the latest saved report that ran it */
    private function previousReport(): array
    {
        $files = glob(storage_path('app/evals/*.json')) ?: [];
        sort($files);
        $previous = [];
        foreach ($files as $file) {
            foreach (json_decode(file_get_contents($file), true)['cases'] ?? [] as $c) {
                $previous[$c['id']] = count(array_filter($c['results'], fn ($r) => ! $r['failures'])).'/'.count($c['results']);
            }
        }

        return $previous;
    }
}
