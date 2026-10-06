<?php

namespace App\Filament\Widgets;

use App\Filament\Resources\Conversations\ConversationResource;
use App\Filament\Resources\Questions\QuestionResource;
use App\Models\Conversation;
use App\Models\Knowledge;
use App\Models\Question;
use Filament\Widgets\StatsOverviewWidget;
use Filament\Widgets\StatsOverviewWidget\Stat;

class ChatStats extends StatsOverviewWidget
{
    protected function getStats(): array
    {
        $pending = Question::where('status', Question::PENDING)->count();

        return [
            Stat::make('Unanswered questions', $pending)
                ->color($pending ? 'danger' : 'success')
                ->description($pending ? 'Waiting for you' : 'All caught up')
                ->url(QuestionResource::getUrl()),
            Stat::make('Chats today', Conversation::where('created_at', '>=', today())->count())
                ->url(ConversationResource::getUrl()),
            Stat::make('Chats in total', Conversation::count()),
            Stat::make('Things the chibi learned', Knowledge::count()),
        ];
    }
}
