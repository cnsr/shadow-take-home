// The agent loop: stream a turn, run any requested tools, feed results back,
// repeat until the model produces a final answer.

import { runTool, toolSchemas } from './tools';
import type { AgentEvent, ChatMessage, Provider, ToolCall } from './types';

const MAX_STEPS = 8;

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s || '{}');
  } catch {
    return {};
  }
}

export async function* runAgent(
  provider: Provider,
  history: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<AgentEvent> {
  const messages: ChatMessage[] = [...history];

  for (let step = 0; step < MAX_STEPS; step++) {
    let assistantText = '';
    let toolCalls: ToolCall[] = [];
    let finish: 'stop' | 'tool_calls' | undefined;

    try {
      for await (const delta of provider.stream(messages, toolSchemas, signal)) {
        if (delta.content) {
          assistantText += delta.content;
          yield { type: 'token', text: delta.content };
        }
        if (delta.tool_calls) toolCalls = delta.tool_calls;
        if (delta.finish) finish = delta.finish;
      }
    } catch (err) {
      yield { type: 'error', message: (err as Error).message };
      yield { type: 'done' };
      return;
    }

    if (finish === 'tool_calls' && toolCalls.length > 0) {
      // Record the assistant turn that requested the tools.
      messages.push({ role: 'assistant', content: assistantText, tool_calls: toolCalls });

      // Execute every tool the model asked for and hand each result back.
      for (const call of toolCalls) {
        const args = safeParse(call.arguments);
        yield { type: 'tool_call', id: call.id, name: call.name, args };
        const result = runTool(call.name, args);
        yield { type: 'tool_result', id: call.id, name: call.name, result };
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.name,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    // No tools requested — this is the final answer.
    messages.push({ role: 'assistant', content: assistantText });
    yield { type: 'assistant_message', content: assistantText };
    yield { type: 'done' };
    return;
  }

  yield { type: 'error', message: `Stopped after ${MAX_STEPS} steps without a final answer.` };
  yield { type: 'done' };
}

export const SYSTEM_PROMPT: ChatMessage = {
  role: 'system',
  content:
    'You are a marketing analytics agent for a DTC brand. You answer questions about ad ' +
    'performance by calling the provided tools over a fixed 90-day dataset. Today is 2026-07-01. ' +
    'Always base numbers on tool results, never guess. Be concise and lead with the answer.',
};
