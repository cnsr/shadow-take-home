import { useRef, useState } from 'react';
import { runAgent, SYSTEM_PROMPT } from '../agent/agent';
import type { ChatMessage, Provider } from '../agent/types';
import { Composer } from './Composer';
import { MessageView, type TraceStep, type UiMessage } from './Message';

let idSeq = 0;
const nextId = () => `m${++idSeq}`;

const SUGGESTIONS = [
  'What was our blended ROAS in June?',
  'Compare Meta and Google for last month',
  'What were the top creatives last month?',
  'How did prospecting do vs retargeting?',
];

export function Chat({ provider }: { provider: Provider }) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const history = useRef<ChatMessage[]>([SYSTEM_PROMPT]);

  async function send(text: string) {
    if (busy || !text.trim()) return;

    const userMsg: UiMessage = { id: nextId(), role: 'user', content: text, trace: [], status: 'done' };
    const assistantId = nextId();
    const assistantMsg: UiMessage = { id: assistantId, role: 'assistant', content: '', trace: [], status: 'streaming', query: text };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setBusy(true);

    const turnHistory: ChatMessage[] = [...history.current, { role: 'user', content: text }];

    try {
      for await (const ev of runAgent(provider, turnHistory)) {
        if (ev.type === 'token') {
          // Append the streamed token to the assistant's message.
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + ev.text } : m))
          );
        } else if (ev.type === 'tool_call') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: '', trace: [...m.trace, { id: ev.id, name: ev.name, args: ev.args, status: 'running' } as TraceStep] }
                : m
            )
          );
        } else if (ev.type === 'tool_result') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, trace: m.trace.map((s) => (s.id === ev.id ? { ...s, result: ev.result, status: 'done' } : s)) }
                : m
            )
          );
        } else if (ev.type === 'assistant_message') {
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: ev.content, status: 'done' } : m)));
          history.current = [...history.current, { role: 'user', content: text }, { role: 'assistant', content: ev.content }];
        } else if (ev.type === 'error') {
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: `⚠️ ${ev.message}`, status: 'error' } : m)));
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="chat">
      <div className="chat__scroll">
        {messages.length === 0 ? (
          <div className="empty">
            <h1>Ask the data anything.</h1>
            <p>This agent is wired to a fixed 90-day marketing performance dataset. It runs fully in your browser.</p>
            <div className="empty__chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <MessageView key={m.id} message={m} />)
        )}
      </div>
      <Composer onSend={send} busy={busy} />
    </main>
  );
}
