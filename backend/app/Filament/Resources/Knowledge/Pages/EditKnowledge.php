<?php

namespace App\Filament\Resources\Knowledge\Pages;

use App\Filament\Resources\Knowledge\KnowledgeResource;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;

class EditKnowledge extends EditRecord
{
    protected static string $resource = KnowledgeResource::class;

    protected function getHeaderActions(): array
    {
        return [
            DeleteAction::make(),
        ];
    }
}
