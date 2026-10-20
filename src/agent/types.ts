// Shared types for the agent runtime.

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // raw JSON string as emitted by the model
}

export interface ChatMessage {
  role: Role;
  content: string;
  // present on assistant messages that request tools
  tool_calls?: ToolCall[];
  // present on tool messages (links a result back to the call)
  tool_call_id?: string;
  name?: string;
}

// Events streamed out of the agent loop and rendered in the thinking trace.
export type AgentEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'tool_result'; id: string; name: string; result: unknown }
  | { type: 'assistant_message'; content: string }
  | { type: 'error'; message: string }
  | { type: 'done' };

// A provider turns a message history into a stream of low-level deltas.
export interface ProviderDelta {
  // incremental assistant text
  content?: string;
  // incremental / complete tool calls the model wants to make
  tool_calls?: ToolCall[];
  // set once the model finishes a turn
  finish?: 'stop' | 'tool_calls';
}

export interface Provider {
  name: string;
  /** Stream one assistant turn given the running history + tool schemas. */
  stream(
    messages: ChatMessage[],
    tools: ToolSchema[],
    signal?: AbortSignal
  ): AsyncGenerator<ProviderDelta>;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
}
