<?php

namespace App\Filament\Resources\Conversations\Tables;

use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\ViewAction;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class ConversationsTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->defaultSort('updated_at', 'desc')
            ->columns([
                TextColumn::make('pending_questions_count')
                    ->label('')
                    ->badge()
                    ->color('danger')
                    ->formatStateUsing(fn (int $state) => "{$state} unanswered")
                    ->placeholder(''),
                TextColumn::make('first_message')
                    ->label('Opened with')
                    ->limit(90)
                    ->wrap(),
                TextColumn::make('message_count')
                    ->label('Messages')
                    ->sortable(),
                TextColumn::make('created_at')
                    ->label('Started')
                    ->since()
                    ->dateTimeTooltip()
                    ->sortable(),
                TextColumn::make('updated_at')
                    ->label('Last message')
                    ->since()
                    ->dateTimeTooltip()
                    ->sortable(),
            ])
            ->recordActions([
                ViewAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ]);
    }
}
