<?php

use App\Http\Controllers\ChatController;
use App\Http\Controllers\NowPlayingController;
use Illuminate\Support\Facades\Route;

Route::post('/chat', ChatController::class);
Route::get('/now-playing', NowPlayingController::class);
