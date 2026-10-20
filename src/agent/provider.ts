// Providers turn a message history into a stream of assistant deltas.
//
// Two implementations:
//   - mockProvider: a scripted, deterministic "model" so the whole app runs
//     with NO API key. Great for reviewers and for fixing the UI/loop bugs.
//   - openAICompatibleProvider: talks to any OpenAI-compatible /chat/completions
//     endpoint (Groq, OpenRouter, Cerebras, Together, …) via the Vite dev proxy.
//
// Both emit the same ProviderDelta shape, so the agent loop doesn't care which
// is in use.

import type { ChatMessage, Provider, ProviderDelta, ToolCall, ToolSchema } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Mock provider (no key required)
// ---------------------------------------------------------------------------

async function* streamText(text: string): AsyncGenerator<ProviderDelta> {
  // Emit word-by-word with a small delay so streaming is actually observable.
  const parts = text.split(/(\s+)/);
  for (const p of parts) {
    await sleep(18);
    yield { content: p };
  }
  yield { finish: 'stop' };
}

function planTools(q: string): ToolCall[] {
  const channels = ['meta', 'google', 'tiktok', 'pinterest', 'amazon', 'facebook'];
  const mentioned = channels.filter((c) => q.includes(c));
  const canon = (c: string) =>
    c === 'facebook' ? 'Meta' : c.charAt(0).toUpperCase() + c.slice(1);

  // Compound comparison across two channels -> TWO tool calls in one turn.
  // (This is the path that exercises the parallel-tool-call handling.)
  const wantsCompare = /\b(vs|versus|compare|against)\b/.test(q) || mentioned.length >= 2;
  if (wantsCompare && mentioned.length >= 2) {
    const [a, b] = mentioned;
    return [
      { id: 'call_a', name: 'query_metrics', arguments: JSON.stringify({ channel: canon(a), start_date: '2026-06-01', end_date: '2026-06-30' }) },
      { id: 'call_b', name: 'query_metrics', arguments: JSON.stringify({ channel: canon(b), start_date: '2026-06-01', end_date: '2026-06-30' }) },
    ];
  }

  // Trend questions -> a daily series for the window.
  if (/trend|over time|daily|by day|time series/.test(q)) {
    const series: any = { group_by: 'date', start_date: '2026-06-01', end_date: '2026-06-30' };
    if (mentioned.length === 1) series.channel = canon(mentioned[0]);
    return [{ id: 'call_t', name: 'query_metrics', arguments: JSON.stringify(series) }];
  }

  if (/creative|ad\b|creators?|angle|format/.test(q)) {
    return [{ id: 'call_c', name: 'top_creatives', arguments: JSON.stringify({ metric: 'roas', min_spend: 500, limit: 5 }) }];
  }

  if (/channel/.test(q)) {
    return [{ id: 'call_g', name: 'query_metrics', arguments: JSON.stringify({ group_by: 'channel', start_date: '2026-06-01', end_date: '2026-06-30' }) }];
  }

  // Any performance-ish question -> a single scoped query. Default window: June.
  if (/roas|spend|revenue|performance|convert|conversion|cpa|ctr|how did|how are|last month|june|month/.test(q)) {
    const single: any = { start_date: '2026-06-01', end_date: '2026-06-30' };
    if (mentioned.length === 1) single.channel = canon(mentioned[0]);
    if (/prospect/.test(q)) single.funnel_stage = 'Prospecting';
    if (/retarget/.test(q)) single.funnel_stage = 'Retargeting';
    return [{ id: 'call_s', name: 'query_metrics', arguments: JSON.stringify(single) }];
  }

  return [];
}

function parseToolResults(afterUser: ChatMessage[]): { name: string; result: any }[] {
  return afterUser
    .filter((m) => m.role === 'tool')
    .map((m) => {
      try {
        return { name: m.name ?? 'tool', result: JSON.parse(m.content) };
      } catch {
        return { name: m.name ?? 'tool', result: m.content };
      }
    });
}

function finalAnswer(results: { name: string; result: any }[]): string {
  if (results.length === 0) return "I couldn't find any data for that.";
  const fmt = (n: number) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

  // Compound comparison
  if (results.length >= 2 && results.every((r) => r.result?.overall)) {
    const lines = results.map((r) => {
      const f = r.result.filter ?? {};
      const o = r.result.overall;
      return `- ${f.channel ?? 'segment'}: ${fmt(o.spend)} spend, ${fmt(o.revenue)} revenue, ${o.roas}x ROAS`;
    });
    return `Here's the head-to-head for June:\n${lines.join('\n')}\n\nWant me to break either one down by funnel stage or creative?`;
  }

  const first = results[0].result;
  if (first?.groups) {
    const top = first.groups.slice(0, 5).map((g: any) => `- ${g.key}: ${fmt(g.metrics.spend)} spend, ${g.metrics.roas}x ROAS`);
    return `By ${first.group_by} for June:\n${top.join('\n')}`;
  }
  if (first?.results && results[0].name === 'top_creatives') {
    const top = first.results.slice(0, 5).map((c: any, i: number) => `${i + 1}. ${c.creative_id} (${c.format}, ${c.angle}) — ${c.roas}x ROAS on ${fmt(c.spend)}`);
    return `Top creatives by ROAS (min $${first.min_spend} spend):\n${top.join('\n')}`;
  }
  if (first?.overall) {
    const o = first.overall;
    return `Across that selection: ${fmt(o.spend)} spend → ${fmt(o.revenue)} revenue, a blended ${o.roas}x ROAS, ${o.conversions.toLocaleString()} conversions at a ${fmt(o.cpa)} CPA.`;
  }
  return "Here's what I found: " + JSON.stringify(first).slice(0, 300);
}

export const mockProvider: Provider = {
  name: 'mock',
  async *stream(messages) {
    const lastUserIdx = messages.map((m) => m.role).lastIndexOf('user');
    const afterUser = messages.slice(lastUserIdx + 1);
    const myToolTurn = [...afterUser].reverse().find((m) => m.role === 'assistant' && m.tool_calls?.length);

    if (myToolTurn && myToolTurn.tool_calls) {
      // We already requested tools this turn. Do we have a result for EACH call?
      const needIds = myToolTurn.tool_calls.map((t) => t.id);
      const haveIds = afterUser.filter((m) => m.role === 'tool').map((m) => m.tool_call_id);
      const missing = needIds.filter((id) => !haveIds.includes(id));

      if (missing.length === 0) {
        yield* streamText(finalAnswer(parseToolResults(afterUser)));
        return;
      }

      // Some tool results never came back correctly. A real model would be stuck
      // here too. Re-ask, but bail after a few tries so nothing hangs.
      const attempts = afterUser.filter((m) => m.role === 'assistant' && m.tool_calls?.length).length;
      if (attempts >= 4) {
        yield* streamText(
          "I never got results back for tool call(s): " + missing.join(', ') + ". " +
          "I requested " + needIds.length + " tools in that turn but only the first one's result came back, " +
          "so I keep re-asking and can't answer. (This is one of the planted issues.)"
        );
        return;
      }
      yield { tool_calls: myToolTurn.tool_calls, finish: 'tool_calls' };
      return;
    }

    // First turn for this user message: greet or plan tools.
    const q = (messages[lastUserIdx]?.content ?? '').toLowerCase();
    const plan = planTools(q);
    if (plan.length === 0) {
      yield* streamText(
        "I'm a marketing analytics agent wired to a 90-day performance dataset. " +
        "Ask me things like \"what was our blended ROAS in June?\", \"compare Meta and Google\", " +
        "or \"what were the top creatives last month?\""
      );
      return;
    }
    yield { tool_calls: plan, finish: 'tool_calls' };
  },
};

// ---------------------------------------------------------------------------
// OpenAI-compatible provider (bring your own key)
// ---------------------------------------------------------------------------

// Calls go through the Vite dev proxy at /api/llm so the API key stays on the
// dev server and browser CORS is a non-issue. See vite.config.ts + .env.example.
export function openAICompatibleProvider(model: string): Provider {
  return {
    name: 'openai-compatible:' + model,
    async *stream(messages, tools: ToolSchema[], signal) {
      const res = await fetch('/api/llm/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          model,
          stream: true,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            ...(m.tool_calls
              ? { tool_calls: m.tool_calls.map((t) => ({ id: t.id, type: 'function', function: { name: t.name, arguments: t.arguments } })) }
              : {}),
            ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
            ...(m.name ? { name: m.name } : {}),
          })),
          tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
          tool_choice: 'auto',
          temperature: 0.2,
        }),
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        throw new Error(`Provider error ${res.status}: ${text.slice(0, 300)}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      // Accumulate streamed tool-call fragments by index.
      const toolAcc: Record<number, { id: string; name: string; arguments: string }> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          let json: any;
          try { json = JSON.parse(payload); } catch { continue; }
          const choice = json.choices?.[0];
          const delta = choice?.delta ?? {};
          if (delta.content) yield { content: delta.content };
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              toolAcc[idx] ??= { id: tc.id ?? `call_${idx}`, name: '', arguments: '' };
              if (tc.id) toolAcc[idx].id = tc.id;
              if (tc.function?.name) toolAcc[idx].name += tc.function.name;
              if (tc.function?.arguments) toolAcc[idx].arguments += tc.function.arguments;
            }
          }
          if (choice?.finish_reason === 'tool_calls') {
            yield { tool_calls: Object.values(toolAcc), finish: 'tool_calls' };
          } else if (choice?.finish_reason === 'stop') {
            yield { finish: 'stop' };
          }
        }
      }
    },
  };
}
