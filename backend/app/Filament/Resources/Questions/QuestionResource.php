<?php

namespace App\Filament\Resources\Questions;

use App\Filament\Resources\Questions\Pages\ListQuestions;
use App\Filament\Resources\Questions\Tables\QuestionsTable;
use App\Models\Question;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;

// The inbox: questions visitors asked that the chibi couldn't answer.
class QuestionResource extends Resource
{
    protected static ?string $model = Question::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedQuestionMarkCircle;

    protected static ?string $navigationLabel = 'Unanswered';

    protected static ?int $navigationSort = 1;

    public static function getNavigationBadge(): ?string
    {
        return Question::where('status', Question::PENDING)->count() ?: null;
    }

    public static function getNavigationBadgeColor(): ?string
    {
        return 'danger';
    }

    public static function table(Table $table): Table
    {
        return QuestionsTable::configure($table);
    }

    public static function getPages(): array
    {
        return [
            'index' => ListQuestions::route('/'),
        ];
    }
}
