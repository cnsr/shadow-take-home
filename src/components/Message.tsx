import { useState } from 'react';
import { chartFromTrace, InlineChart } from './InlineChart';

export interface TraceStep {
  id: string;
  name: string;
  args: unknown;
  result?: unknown;
  status: 'running' | 'done';
}

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  trace: TraceStep[];
  status: 'streaming' | 'done' | 'error';
  query?: string; // the user question this assistant message answers
}

export function MessageView({ message }: { message: UiMessage }) {
  if (message.role === 'user') {
    return (
      <div className="msg msg--user">
        <div className="bubble bubble--user">{message.content}</div>
      </div>
    );
  }

  // Only chart finished answers, so it doesn't flicker between tool rounds.
  const chart = message.status === 'done' ? chartFromTrace(message.trace, message.query ?? '') : null;

  return (
    <div className="msg msg--assistant">
      <div className="avatar" aria-hidden />
      <div className="msg__body">
        {message.trace.length > 0 && <ThinkingTrace steps={message.trace} />}
        <div className={`bubble bubble--assistant ${message.status === 'error' ? 'bubble--error' : ''}`}>
          {message.content ? (
            <div className="prose">{message.content}</div>
          ) : (
            <span className="typing">
              <i /> <i /> <i />
            </span>
          )}
          {chart && <InlineChart chart={chart} />}
        </div>
      </div>
    </div>
  );
}

function ThinkingTrace({ steps }: { steps: TraceStep[] }) {
  const [open, setOpen] = useState(true);
  const running = steps.some((s) => s.status === 'running');
  return (
    <div className="trace">
      <button className="trace__toggle" onClick={() => setOpen((o) => !o)}>
        <span className={`trace__dot ${running ? 'trace__dot--live' : ''}`} />
        {running ? 'Thinking' : 'Thought process'} · {steps.length} step{steps.length === 1 ? '' : 's'}
        <span className="trace__chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="trace__steps">
          {steps.map((s) => (
            <div className="trace__step" key={s.id}>
              <div className="trace__head">
                <span className="trace__tool">{s.name}</span>
                <span className={`trace__status trace__status--${s.status}`}>{s.status}</span>
              </div>
              <pre className="trace__code">{JSON.stringify(s.args, null, 2)}</pre>
              {s.result !== undefined && (
                <pre className="trace__code trace__code--result">{preview(s.result)}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function preview(result: unknown): string {
  const s = JSON.stringify(result, null, 2);
  return s.length > 900 ? s.slice(0, 900) + '\n… (truncated)' : s;
}
