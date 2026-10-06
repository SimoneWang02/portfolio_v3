<?php

namespace App\Filament\Resources\Knowledge;

use App\Filament\Resources\Knowledge\Pages\CreateKnowledge;
use App\Filament\Resources\Knowledge\Pages\EditKnowledge;
use App\Filament\Resources\Knowledge\Pages\ListKnowledge;
use App\Filament\Resources\Knowledge\Schemas\KnowledgeForm;
use App\Filament\Resources\Knowledge\Tables\KnowledgeTable;
use App\Models\Knowledge;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;

// Simone's answers; all of them are added to the chibi's prompt.
class KnowledgeResource extends Resource
{
    protected static ?string $model = Knowledge::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedLightBulb;

    protected static ?string $modelLabel = 'answer';

    protected static ?string $navigationLabel = 'Knowledge';

    protected static ?string $pluralModelLabel = 'knowledge';

    protected static ?int $navigationSort = 3;

    public static function form(Schema $schema): Schema
    {
        return KnowledgeForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return KnowledgeTable::configure($table);
    }

    public static function getPages(): array
    {
        return [
            'index' => ListKnowledge::route('/'),
            'create' => CreateKnowledge::route('/create'),
            'edit' => EditKnowledge::route('/{record}/edit'),
        ];
    }
}
