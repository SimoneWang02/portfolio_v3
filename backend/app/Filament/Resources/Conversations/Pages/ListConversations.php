<?php

namespace App\Filament\Resources\Conversations\Pages;

use App\Filament\Resources\Conversations\ConversationResource;
use App\Models\Conversation;
use Filament\Resources\Pages\ListRecords;
use Filament\Schemas\Components\Tabs\Tab;
use Illuminate\Database\Eloquent\Builder;

class ListConversations extends ListRecords
{
    protected static string $resource = ConversationResource::class;

    public function getTabs(): array
    {
        return [
            'all' => Tab::make(),
            'unanswered' => Tab::make('With unanswered questions')
                ->modifyQueryUsing(fn (Builder $query) => $query->has('pendingQuestions'))
                ->badge(Conversation::has('pendingQuestions')->count() ?: null)
                ->badgeColor('danger'),
        ];
    }
}
