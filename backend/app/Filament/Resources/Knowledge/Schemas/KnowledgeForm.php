<?php

namespace App\Filament\Resources\Knowledge\Schemas;

use Filament\Forms\Components\Textarea;
use Filament\Schemas\Schema;

class KnowledgeForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->columns(1)
            ->components([
                Textarea::make('question')->required()->rows(2)->maxLength(1000),
                Textarea::make('answer')->required()->rows(5)->maxLength(2000)
                    ->helperText('Write it as a fact about you; the chibi puts it in its own words.'),
            ]);
    }
}
