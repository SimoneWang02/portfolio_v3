<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Model;

// Simone's answers, appended to the persona prompt.
#[Table(name: 'knowledge')]
#[Fillable(['question', 'answer'])]
class Knowledge extends Model
{
}
