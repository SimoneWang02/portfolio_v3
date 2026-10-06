<?php

namespace Tests\Feature;

use App\Filament\Resources\Conversations\Pages\ViewConversation;
use App\Filament\Resources\Conversations\RelationManagers\MessagesRelationManager;
use App\Filament\Resources\Questions\Pages\ListQuestions;
use App\Models\Conversation;
use App\Models\Knowledge;
use App\Models\Question;
use App\Models\User;
use Filament\Actions\Testing\TestAction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Livewire\Livewire;
use Tests\TestCase;

class AdminTest extends TestCase
{
    use RefreshDatabase;

    private Conversation $chat;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.chat.admin_email' => 'admin@example.com']);
        $this->actingAs(User::factory()->create(['email' => 'admin@example.com']));

        $this->chat = Conversation::create(['id' => (string) Str::uuid(), 'ip_hash' => 'x']);
    }

    private function pending(string $text): Question
    {
        $message = $this->chat->messages()->create(['role' => 'user', 'content' => $text, 'forwarded' => true]);

        return Question::record($text, $message);
    }

    public function test_every_admin_page_renders(): void
    {
        $this->pending('Favourite pasta?');
        Knowledge::create(['question' => 'Pets?', 'answer' => 'A cat.']);

        foreach (['/admin', '/admin/questions', '/admin/conversations', "/admin/conversations/{$this->chat->id}", '/admin/knowledge', '/admin/knowledge/create'] as $url) {
            $this->get($url)->assertOk();
        }
    }

    public function test_only_the_admin_email_gets_in(): void
    {
        $this->actingAs(User::factory()->create(['email' => 'someone@example.com']));

        $this->get('/admin')->assertForbidden();
    }

    public function test_answering_turns_a_question_into_knowledge(): void
    {
        $question = $this->pending('fav pasta');

        Livewire::test(ListQuestions::class)
            ->assertCanSeeTableRecords([$question])
            ->callAction(TestAction::make('answer')->table($question), data: [
                'question' => 'What is your favourite pasta?',
                'answer' => 'Carbonara.',
            ])
            ->assertHasNoFormErrors();

        $this->assertSame(Question::ANSWERED, $question->fresh()->status);
        $this->assertSame('Carbonara.', Knowledge::where('question', 'What is your favourite pasta?')->value('answer'));
    }

    public function test_pending_tab_hides_handled_questions(): void
    {
        $open = $this->pending('Open one?');
        $dismissed = $this->pending('Dismissed one?');

        Livewire::test(ListQuestions::class)
            ->callAction(TestAction::make('dismiss')->table($dismissed))
            ->assertCanSeeTableRecords([$open])
            ->assertCanNotSeeTableRecords([$dismissed]);
    }

    public function test_merging_sums_ask_counts(): void
    {
        $a = $this->pending('Favourite pasta?');
        $b = $this->pending('Which pasta do you like most?');

        Livewire::test(ListQuestions::class)
            ->selectTableRecords([$a->id, $b->id])
            ->callAction(TestAction::make('merge')->table()->bulk());

        $this->assertSame(2, Question::sole()->ask_count);
    }

    public function test_a_message_can_be_flagged_by_hand(): void
    {
        $message = $this->chat->messages()->create(['role' => 'user', 'content' => 'Do you like jazz?']);

        Livewire::test(MessagesRelationManager::class, ['ownerRecord' => $this->chat, 'pageClass' => ViewConversation::class])
            ->callAction(TestAction::make('flag')->table($message));

        $this->assertSame('Do you like jazz?', Question::sole()->question);
        $this->assertTrue($message->fresh()->forwarded);
    }
}
