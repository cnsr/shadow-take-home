import { useState } from 'react';

export function Composer({ onSend, busy }: { onSend: (text: string) => void; busy: boolean }) {
  const [value, setValue] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !value.trim()) return;
    onSend(value);
    setValue('');
  }

  return (
    <form className="composer" onSubmit={submit}>
      <input
        className="composer__input"
        placeholder="Ask about spend, ROAS, channels, creatives…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        autoFocus
      />
      <button className="composer__send" type="submit" disabled={busy || !value.trim()}>
        {busy ? 'Working…' : 'Send'}
      </button>
    </form>
  );
}
