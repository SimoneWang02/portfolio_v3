<?php

namespace App\Filament\Resources\Questions\Pages;

use App\Filament\Resources\Questions\QuestionResource;
use App\Models\Question;
use Filament\Resources\Pages\ListRecords;
use Filament\Schemas\Components\Tabs\Tab;
use Illuminate\Database\Eloquent\Builder;

class ListQuestions extends ListRecords
{
    protected static string $resource = QuestionResource::class;

    protected ?string $heading = 'Questions the chibi couldn\'t answer';

    public function getTabs(): array
    {
        $tab = fn (string $status) => Tab::make()
            ->modifyQueryUsing(fn (Builder $query) => $query->where('status', $status));

        return [
            Question::PENDING => $tab(Question::PENDING)
                ->badge(Question::where('status', Question::PENDING)->count() ?: null)
                ->badgeColor('danger'),
            Question::ANSWERED => $tab(Question::ANSWERED),
            Question::DISMISSED => $tab(Question::DISMISSED),
        ];
    }

    public function getDefaultActiveTab(): string|int|null
    {
        return Question::PENDING;
    }
}
