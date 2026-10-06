<?php

namespace App\Filament\Resources\Conversations\RelationManagers;

use App\Models\Message;
use App\Models\Question;
use Filament\Actions\Action;
use Filament\Notifications\Notification;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

// The transcript. Forwarded messages are flagged red; any visitor message can be flagged by hand
// when the chibi dodged a question without forwarding it.
class MessagesRelationManager extends RelationManager
{
    protected static string $relationship = 'messages';

    protected static ?string $title = 'Transcript';

    public function isReadOnly(): bool
    {
        return false; // keeps the flag action available on the view page
    }

    public function table(Table $table): Table
    {
        return $table
            ->defaultSort('id')
            ->paginated(false)
            ->columns([
                TextColumn::make('role')
                    ->label('')
                    ->badge()
                    ->formatStateUsing(fn (string $state) => $state === 'user' ? 'Visitor' : 'Chibi')
                    ->color(fn (string $state) => $state === 'user' ? 'info' : 'gray'),
                TextColumn::make('content')
                    ->label('Message')
                    ->wrap(),
                IconColumn::make('forwarded')
                    ->label('Forwarded')
                    ->icon(fn (bool $state) => $state ? Heroicon::ExclamationCircle : null)
                    ->color('danger')
                    ->tooltip(fn (bool $state) => $state ? 'The chibi couldn\'t answer this' : null),
                TextColumn::make('created_at')
                    ->label('')
                    ->time()
                    ->color('gray'),
            ])
            ->recordActions([
                Action::make('flag')
                    ->label('Flag as question')
                    ->icon(Heroicon::Flag)
                    ->color('danger')
                    ->visible(fn (Message $record) => $record->role === 'user' && ! $record->forwarded)
                    ->action(function (Message $record) {
                        Question::record($record->content, $record);
                        $record->update(['forwarded' => true]);
                        Notification::make()->title('Added to Unanswered')->success()->send();
                    }),
            ]);
    }
}
