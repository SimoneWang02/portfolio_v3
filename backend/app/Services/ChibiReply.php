<?php

namespace App\Services;

// One turn of the chibi: streams the reply, hands forward_question calls to $forward, and makes sure a question
// it claims to have passed on really is. Used by the eval command; mirrors ChatController::reply().
class ChibiReply
{
    public const FORWARDED = 'Forwarded to the real me.';

    // "I've passed it on", "passed your question about X on to the real me"...
    public const CLAIMS_FORWARD = '/\bpass(?:ed|ing)\b[^.!?]{0,80}?\bon\b/i';

    private const FORCE_FORWARD = ['type' => 'function', 'function' => ['name' => 'forward_question']];

    public const FORWARD_TOOL = [
        'type' => 'function',
        'function' => [
            'name' => 'forward_question',
            'description' => "Send a question about the site owner that you can't answer to the real owner, who will answer it later.",
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'question' => ['type' => 'string', 'description' => "The visitor's question as a short standalone question addressed to me in second person, e.g. 'What is your favourite pasta dish?'"],
                ],
                'required' => ['question'],
            ],
        ],
    ];

    public function __construct(private DeepSeekClient $ai) {}

    /**
     * @param  callable(string): void  $emit  gets the visible reply as it streams
     * @param  callable(array): string  $forward  handles one forward_question call and returns the tool result
     * @return array{forwarded: bool, faked: bool} faked: the model only said it passed the question on, so the tool was forced
     */
    public function stream(array $messages, callable $emit, callable $forward): array
    {
        $first = $this->ai->stream($messages, [self::FORWARD_TOOL], $emit);

        if (! $first['tool_calls']) {
            if (! preg_match(self::CLAIMS_FORWARD, $first['content'])) {
                return ['forwarded' => false, 'faked' => false];
            }
            // it told the visitor it passed the question on but never called the tool: ask again with the
            // tool forced, quietly, so the question really reaches the dashboard
            $forced = $this->ai->stream($messages, [self::FORWARD_TOOL], fn () => null, self::FORCE_FORWARD);
            foreach ($forced['tool_calls'] as $call) {
                $forward($call);
            }

            return ['forwarded' => true, 'faked' => true];
        }

        $messages[] = ['role' => 'assistant', 'content' => $first['content'], 'tool_calls' => $first['tool_calls']];
        $allForwarded = true;
        foreach ($first['tool_calls'] as $call) {
            $result = $forward($call);
            $allForwarded = $allForwarded && $result === self::FORWARDED;
            $messages[] = ['role' => 'tool', 'tool_call_id' => $call['id'], 'content' => $result];
        }
        // the model often writes its "passed it on" line alongside the call; if that's already true, don't say it twice
        if (trim($first['content']) === '' || ! $allForwarded) {
            // no tools on the follow-up, so the model can't loop
            $this->ai->stream($messages, null, $emit);
        }

        return ['forwarded' => true, 'faked' => false];
    }
}
