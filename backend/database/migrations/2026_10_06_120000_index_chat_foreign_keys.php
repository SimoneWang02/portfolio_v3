<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// SQLite doesn't index foreign keys on its own; the admin lists and the forward cap look messages and
// questions up by conversation, which otherwise scans the whole table for every row.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->index(['conversation_id', 'role']);
        });
        Schema::table('questions', function (Blueprint $table) {
            $table->index(['conversation_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->dropIndex(['conversation_id', 'role']);
        });
        Schema::table('questions', function (Blueprint $table) {
            $table->dropIndex(['conversation_id', 'status']);
        });
    }
};
