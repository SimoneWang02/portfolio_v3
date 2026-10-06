<?php

namespace App\Services;

use GuzzleHttp\Psr7\Utils;
use Illuminate\Support\Facades\Http;

// Streaming chat completions against DeepSeek's OpenAI-compatible API.
class DeepSeekClient
{
    /**
     * Streams one completion: text deltas go to $onText as they arrive; tool calls are collected.
     *
     * @return array{content: string, tool_calls: array<int, array>}
     */
    public function stream(array $messages, ?array $tools, callable $onText): array
    {
        $payload = [
            'model' => config('services.deepseek.model'),
            'stream' => true,
            'temperature' => 0.8,
            'max_tokens' => 400,
            'messages' => $messages,
        ];
        if ($tools) {
            $payload['tools'] = $tools;
        }

        $response = Http::withToken(config('services.deepseek.key'))
            ->withOptions(['stream' => true])
            ->timeout(60)
            ->post(config('services.deepseek.url'), $payload);
        $response->throw(); // a RequestException, so callers can tell a 402 (balance ran out) from other failures

        $content = '';
        $calls = []; // tool calls arrive in fragments keyed by index
        $body = $response->toPsrResponse()->getBody();
        while (! $body->eof()) {
            $line = trim(Utils::readLine($body));
            if (! str_starts_with($line, 'data:')) {
                continue;
            }
            $data = trim(substr($line, 5));
            if ($data === '[DONE]') {
                break;
            }
            $delta = json_decode($data, true)['choices'][0]['delta'] ?? [];
            if (($text = $delta['content'] ?? '') !== '') {
                $content .= $text;
                $onText($text);
            }
            foreach ($delta['tool_calls'] ?? [] as $part) {
                $call = &$calls[$part['index'] ?? 0];
                $call['id'] ??= $part['id'] ?? null;
                $call['type'] = 'function';
                $call['function']['name'] ??= $part['function']['name'] ?? null;
                $call['function']['arguments'] = ($call['function']['arguments'] ?? '').($part['function']['arguments'] ?? '');
                unset($call);
            }
        }

        return ['content' => $content, 'tool_calls' => array_values($calls)];
    }
}
