<?php

namespace App\Services;

use App\Models\Knowledge;

// System prompt = persona.md (voice + core bio) + every answer Simone gave in the dashboard.
class PersonaPrompt
{
    public function build(): string
    {
        // re-read so edits apply live; fall back to the template on a fresh clone
        $path = config('services.chat.persona_path');
        if (! is_file($path)) {
            $path = dirname($path).'/persona.example.md';
        }
        $prompt = trim(file_get_contents($path));

        $known = Knowledge::orderBy('id')->get(['question', 'answer']);
        if ($known->isNotEmpty()) {
            $prompt .= "\n\nThings I've already answered (these are facts about me too):";
            foreach ($known as $k) {
                $prompt .= "\n- Q: {$k->question}\n  A: {$k->answer}";
            }
        }

        return $prompt."\n\n".<<<'TXT'
        You have one tool, forward_question, and it is the ONLY way a question reaches the real me.
        Whenever a visitor asks something about me (my life, background, opinions, preferences, plans or work)
        that nothing above answers, you MUST call forward_question first, with their question rephrased as a
        short standalone question addressed to me ("you"). Never say you passed something on without calling the tool, or it is lost.
        After the tool result, reply in one or two sentences that you don't know that one yet and have passed
        it on. Don't call it for greetings, small talk or questions that aren't about me, and never guess.
        TXT;
    }
}
