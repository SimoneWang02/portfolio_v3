<?php

namespace App\Filament\Resources\Conversations\Schemas;

use Filament\Infolists\Components\TextEntry;
use Filament\Schemas\Schema;

class ConversationInfolist
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->columns(4)
            ->components([
                TextEntry::make('created_at')->label('Started')->dateTime(),
                TextEntry::make('updated_at')->label('Last message')->since()->dateTimeTooltip(),
                TextEntry::make('message_count')->label('Messages'),
                TextEntry::make('pending_questions_count')
                    ->label('Unanswered')
                    ->badge()
                    ->color(fn (int $state) => $state ? 'danger' : 'gray'),
                TextEntry::make('user_agent')->label('Browser')->columnSpanFull()->color('gray'),
            ]);
    }
}
