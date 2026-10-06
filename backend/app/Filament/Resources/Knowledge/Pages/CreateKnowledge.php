<?php

namespace App\Filament\Resources\Knowledge\Pages;

use App\Filament\Resources\Knowledge\KnowledgeResource;
use App\Services\ConflictCheck;
use Filament\Resources\Pages\CreateRecord;

class CreateKnowledge extends CreateRecord
{
    protected static string $resource = KnowledgeResource::class;

    protected function afterCreate(): void
    {
        app(ConflictCheck::class)->warn($this->record->question, $this->record->answer, $this->record->id);
    }
}
