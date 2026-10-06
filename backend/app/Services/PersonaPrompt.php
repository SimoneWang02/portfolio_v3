<?php

namespace App\Services;

use App\Models\Knowledge;

// System prompt = persona.md (voice + core bio) + every answer Simone gave in the dashboard.
class PersonaPrompt
{
    public function build(): string
    {
        $prompt = $this->persona();

        $known = Knowledge::orderBy('id')->get(['question', 'answer']);
        if ($known->isNotEmpty()) {
            $prompt .= "\n\nAnswers I've given since, newest last. They're facts about me too, and they're newer than the above:"
                ." if one contradicts something above, the answer wins, and a later answer beats an earlier one.";
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
        it on. Questions about my tastes or opinions ("do you like X?", "what do you think of Y?") are about me:
        if X isn't mentioned above, that doesn't mean I dislike it or never got into it, so forward it instead of answering.
        Short follow-ups ("where?", "when?", "with who?") ask about the exact thing just discussed: if nothing above
        answers it for that thing, forward it with the context spelled out ("Where are you going on your May 2027 vacation?")
        rather than answering with a related fact about something else, like a different trip or year.
        Knowing a topic isn't knowing every detail of it: if a visitor asks how I did something or why I like something,
        and nothing above gives that how or why, forward it. Never fill the gap with reasons, steps or technical details
        that sound plausible, even ones a developer or a fan would typically give.
        Don't call it for greetings, small talk or questions that aren't about me, and never guess.
        TXT
            // the model has no clock: without this it grabs a date from the bio (my birthday) when asked what day it is
            ."\n\nToday is ".now('America/New_York')->format('l, j F Y')
            ." in New York. Use it for anything that depends on the date, like my age or how far into my M.S. I am.";
    }

    public function persona(): string
    {
        // re-read so edits apply live; fall back to the template on a fresh clone
        $path = config('services.chat.persona_path');
        if (! is_file($path)) {
            $path = dirname($path).'/persona.example.md';
        }

        return trim(file_get_contents($path));
    }
}
