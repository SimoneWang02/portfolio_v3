<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ChibiEvalTest extends TestCase
{
    use RefreshDatabase;

    private string $dir;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.deepseek.key' => 'test-key']);
        $this->dir = sys_get_temp_dir().'/chibi-eval-'.uniqid();
        mkdir($this->dir);
        $this->app->useStoragePath($this->dir); // keep test reports out of the real storage/app/evals
    }

    protected function tearDown(): void
    {
        array_map('unlink', glob("$this->dir/app/evals/*") ?: []);
        @rmdir("$this->dir/app/evals");
        @rmdir("$this->dir/app");
        array_map('unlink', glob("$this->dir/*.php") ?: []);
        rmdir($this->dir);
        parent::tearDown();
    }

    private function sse(array $deltas): string
    {
        $lines = array_map(fn ($d) => 'data: '.json_encode(['choices' => [['delta' => $d]]]), $deltas);

        return implode("\n\n", [...$lines, 'data: [DONE]'])."\n\n";
    }

    private function cases(array $cases): string
    {
        file_put_contents($path = "$this->dir/cases.php", '<?php return '.var_export($cases, true).';');

        return $path;
    }

    public function test_replies_are_graded_by_code_checks_and_the_judge(): void
    {
        $path = $this->cases([
            ['id' => 'facts.work', 'ask' => 'Where did you work?', 'forward' => false, 'match' => '/Bonobo/'],
            ['id' => 'unknown.pasta', 'ask' => 'Favourite pasta?', 'forward' => true],
            ['id' => 'yesno.chinese', 'ask' => 'Are you Chinese?', 'judge' => 'Starts with a clear yes.'],
        ]);
        Http::fakeSequence()
            ->push($this->sse([['content' => 'At Bonobo, in Modena.']]))
            ->push($this->sse([['content' => 'Carbonara, obviously 🍝']]))
            ->push($this->sse([['content' => 'My parents are Chinese.']]))
            ->push($this->sse([['content' => '{"pass": false, "reason": "it never says yes"}']]));

        $this->artisan('chibi:eval', ['--cases' => $path, '--runs' => 1, '--parallel' => 1])
            ->expectsOutputToContain('1/1  facts.work')
            ->expectsOutputToContain("didn't forward the question")
            ->expectsOutputToContain('uses emoji')
            ->expectsOutputToContain('judge: it never says yes')
            ->assertExitCode(1);

        Http::assertSent(fn (Request $r) => ($r['response_format']['type'] ?? null) === 'json_object' && $r['temperature'] === 0
            && str_contains($r['messages'][1]['content'], 'Criterion: Starts with a clear yes.'));
        $this->assertCount(1, glob("$this->dir/app/evals/*.json"));
    }

    public function test_a_reply_claiming_to_forward_without_the_tool_counts_as_forwarded(): void
    {
        $path = $this->cases([['id' => 'unknown.pets', 'ask' => 'Do you have a pet?', 'forward' => true]]);
        Http::fakeSequence()
            ->push($this->sse([['content' => "Don't know yet, I've passed it on to the real me."]]))
            ->push($this->sse([['tool_calls' => [['index' => 0, 'id' => 'c', 'type' => 'function', 'function' => ['name' => 'forward_question', 'arguments' => '{"question": "Do you have a pet?"}']]]]]));

        $this->artisan('chibi:eval', ['--cases' => $path, '--runs' => 1, '--parallel' => 1])
            ->expectsOutputToContain('1/1  unknown.pets')
            ->expectsOutputToContain('1 replies said they passed the question on without calling the tool')
            ->assertExitCode(0);
    }
}
