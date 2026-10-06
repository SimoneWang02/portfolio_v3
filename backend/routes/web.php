<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// The React site is built into ../dist; nginx serves its files, and client-side routes
// (/, /experience, ...) land here and get index.html. Unknown files and API paths stay 404.
$spa = function (Request $request) {
    abort_if($request->is('api/*') || str_contains(basename($request->path()), '.'), 404);
    $index = base_path('../dist/index.html');
    abort_unless(is_file($index), 404, 'Run npm run build first.');

    return response()->file($index, ['Cache-Control' => 'no-cache']);
};

Route::get('/', $spa);
Route::fallback($spa);
