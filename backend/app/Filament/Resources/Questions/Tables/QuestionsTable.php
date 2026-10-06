<?php

namespace App\Filament\Resources\Questions\Tables;

use App\Filament\Resources\Conversations\ConversationResource;
use App\Models\Question;
use Filament\Actions\Action;
use Filament\Actions\BulkAction;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Forms\Components\Textarea;
use Filament\Notifications\Notification;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Collection;

class QuestionsTable
{
    public static function configure(Table $table): Table
    {
        $pending = fn (Question $record) => $record->status === Question::PENDING;

        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                TextColumn::make('question')
                    ->wrap()
                    ->searchable(),
                TextColumn::make('ask_count')
                    ->label('Asked')
                    ->formatStateUsing(fn (int $state) => "{$state}×")
                    ->badge()
                    ->color(fn (int $state) => $state > 1 ? 'warning' : 'gray')
                    ->sortable(),
                TextColumn::make('created_at')
                    ->label('First asked')
                    ->since()
                    ->dateTimeTooltip()
                    ->sortable(),
                TextColumn::make('answered_at')
                    ->label('Answered')
                    ->since()
                    ->dateTimeTooltip()
                    ->toggleable(isToggledHiddenByDefault: true),
            ])
            ->recordActions([
                Action::make('answer')
                    ->icon(Heroicon::ChatBubbleBottomCenterText)
                    ->button()
                    ->visible($pending)
                    ->modalHeading('Answer this question')
                    ->modalDescription('Write it as a fact about you. The chibi uses it from the next message on and puts it in its own words.')
                    ->fillForm(fn (Question $record) => ['question' => $record->question])
                    ->schema([
                        Textarea::make('question')->required()->rows(2)->maxLength(1000),
                        Textarea::make('answer')->required()->rows(5)->maxLength(2000)->autofocus(),
                    ])
                    ->action(function (array $data, Question $record) {
                        $record->answer($data['question'], $data['answer']);
                        Notification::make()->title('Saved. The chibi knows this now.')->success()->send();
                    }),
                Action::make('chat')
                    ->label('View chat')
                    ->icon(Heroicon::ChatBubbleLeftRight)
                    ->color('gray')
                    ->visible(fn (Question $record) => $record->conversation_id !== null)
                    ->url(fn (Question $record) => ConversationResource::getUrl('view', ['record' => $record->conversation_id])),
                Action::make('dismiss')
                    ->icon(Heroicon::XMark)
                    ->color('gray')
                    ->visible($pending)
                    ->action(fn (Question $record) => $record->update(['status' => Question::DISMISSED])),
                Action::make('reopen')
                    ->icon(Heroicon::ArrowUturnLeft)
                    ->color('gray')
                    ->visible(fn (Question $record) => $record->status === Question::DISMISSED)
                    ->action(fn (Question $record) => $record->update(['status' => Question::PENDING])),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    BulkAction::make('merge')
                        ->label('Merge duplicates')
                        ->icon(Heroicon::ArrowsPointingIn)
                        ->requiresConfirmation()
                        ->modalDescription('Keeps the oldest question and adds the others\' ask counts to it.')
                        ->deselectRecordsAfterCompletion()
                        ->action(fn (Collection $records) => Question::merge($records)),
                    BulkAction::make('dismiss')
                        ->label('Dismiss selected')
                        ->icon(Heroicon::XMark)
                        ->deselectRecordsAfterCompletion()
                        ->action(fn (Collection $records) => $records->each->update(['status' => Question::DISMISSED])),
                    DeleteBulkAction::make(),
                ]),
            ]);
    }
}
